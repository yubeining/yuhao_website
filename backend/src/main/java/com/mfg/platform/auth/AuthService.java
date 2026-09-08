package com.mfg.platform.auth;

import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.PartyType;
import com.mfg.common.security.UserPrincipal;
import com.mfg.platform.identity.ExternalUser;
import com.mfg.platform.identity.ExternalUserRepository;
import com.mfg.platform.identity.OpsUser;
import com.mfg.platform.identity.OpsUserRepository;
import com.mfg.platform.identity.Organization;
import com.mfg.platform.identity.OrganizationRepository;
import com.mfg.platform.identity.Role;
import com.mfg.platform.identity.RoleRepository;
import com.mfg.platform.identity.UserRoleRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 账号密码认证 —— 内部走 {@link OpsUser}、外部走 {@link ExternalUser},<b>各查各表</b>,
 * 物理隔离,一个查询不会跨到另一边。
 *
 * <h3>失败一律 {@code auth.bad_credentials}</h3>
 * <p>账号不存在 / 密码错 / 被禁用 / 端不匹配 —— 对外都返同一个错,不泄露"账号是否存在"(防枚举)。
 *
 * <p>受众是结构性的:内部登录只认 ops_user;外部登录还要核对 {@code portalType} 与用户所在
 * 组织的 {@code type} 一致(客户 token 不能登供应商公司)。角色从 {@code user_role → role.code} 取。
 */
@Service
public class AuthService {

    private static final String BAD_CREDENTIALS = "auth.bad_credentials";

    private final OpsUserRepository opsUsers;
    private final ExternalUserRepository externalUsers;
    private final OrganizationRepository organizations;
    private final UserRoleRepository userRoles;
    private final RoleRepository roles;
    private final PasswordEncoder passwordEncoder;

    public AuthService(OpsUserRepository opsUsers, ExternalUserRepository externalUsers,
                       OrganizationRepository organizations, UserRoleRepository userRoles,
                       RoleRepository roles, PasswordEncoder passwordEncoder) {
        this.opsUsers = opsUsers;
        this.externalUsers = externalUsers;
        this.organizations = organizations;
        this.userRoles = userRoles;
        this.roles = roles;
        this.passwordEncoder = passwordEncoder;
    }

    /** 认证结果:principal + 展示名(登录响应要,principal 里不带)。 */
    public record Authenticated(UserPrincipal principal, String displayName) {
    }

    // ---------- 内部(运营)----------

    @Transactional(readOnly = true)
    public Authenticated authenticateOps(String account, String rawPassword) {
        OpsUser u = opsUsers.findByEmail(normalize(account)).orElse(null);
        if (u == null || u.getStatus() != OpsUser.Status.ACTIVE
                || !matches(rawPassword, u.getPasswordHash())) {
            throw new BusinessException(401, BAD_CREDENTIALS);
        }
        return new Authenticated(opsPrincipal(u), u.getDisplayName());
    }

    // ---------- 外部(客户 / 供应商)----------

    /**
     * 外部登录:只凭 account + password —— <b>受众(客户/供应商)从用户所在组织的 type 推出</b>,
     * 不用调用方声明(external_user 的 email 全局唯一,一个账号唯一对应一家公司)。
     */
    @Transactional(readOnly = true)
    public Authenticated authenticateExternal(String account, String rawPassword) {
        ExternalUser u = externalUsers.findByEmail(normalize(account)).orElse(null);
        if (u == null || u.getStatus() != ExternalUser.Status.ACTIVE
                || !matches(rawPassword, u.getPasswordHash())) {
            throw new BusinessException(401, BAD_CREDENTIALS);
        }
        Organization org = organizations.findById(u.getOrgId()).orElse(null);
        // 外部账号必须挂在客户/供应商组织下;组织停用或异常(指到 INTERNAL)一律拒
        if (org == null || org.getStatus() != Organization.Status.ACTIVE
                || audienceOf(org.getType()) == PartyType.OPERATOR) {
            throw new BusinessException(401, BAD_CREDENTIALS);
        }
        return new Authenticated(externalPrincipal(u, org), u.getDisplayName());
    }

    // ---------- 刷新时重载(反映当前状态:被禁用/被删的刷新失败)----------

    @Transactional(readOnly = true)
    public Authenticated loadPrincipal(PartyType portal, UUID userId) {
        if (portal == PartyType.OPERATOR) {
            OpsUser u = opsUsers.findById(userId)
                    .filter(o -> o.getStatus() == OpsUser.Status.ACTIVE)
                    .orElseThrow(() -> new BusinessException(401, BAD_CREDENTIALS));
            return new Authenticated(opsPrincipal(u), u.getDisplayName());
        }
        ExternalUser u = externalUsers.findById(userId)
                .filter(e -> e.getStatus() == ExternalUser.Status.ACTIVE)
                .orElseThrow(() -> new BusinessException(401, BAD_CREDENTIALS));
        Organization org = requireMatchingOrg(u.getOrgId(), portal);
        return new Authenticated(externalPrincipal(u, org), u.getDisplayName());
    }

    // ---------- principal 构造 ----------

    private UserPrincipal opsPrincipal(OpsUser u) {
        // 运营无 partyId（D23）
        return new UserPrincipal(u.getId(), null, PartyType.OPERATOR,
                u.getEmail(), localeOr(u.getLocale()), rolesOf(u.getId()));
    }

    private UserPrincipal externalPrincipal(ExternalUser u, Organization org) {
        return new UserPrincipal(u.getId(), u.getOrgId(), audienceOf(org.getType()),
                u.getEmail(), localeOr(u.getLocale()), rolesOf(u.getId()));
    }

    /** 组织类型 → 受众。 */
    private static PartyType audienceOf(Organization.Type type) {
        return switch (type) {
            case CUSTOMER -> PartyType.CUSTOMER;
            case SUPPLIER -> PartyType.SUPPLIER;
            case INTERNAL -> PartyType.OPERATOR;
        };
    }

    private Organization requireMatchingOrg(UUID orgId, PartyType portal) {
        Organization org = organizations.findById(orgId)
                .orElseThrow(() -> new BusinessException(401, BAD_CREDENTIALS));
        if (audienceOf(org.getType()) != portal || org.getStatus() != Organization.Status.ACTIVE) {
            throw new BusinessException(401, BAD_CREDENTIALS);
        }
        return org;
    }

    /** 从 user_role → role.code 取当前有效角色(现在角色表为空 → 空集)。 */
    private Set<String> rolesOf(UUID userId) {
        return userRoles.findByUserId(userId).stream()
                .map(ur -> roles.findById(ur.getRoleId()).orElse(null))
                .filter(r -> r != null && r.getStatus() == Role.Status.ACTIVE)
                .map(Role::getCode)
                .collect(Collectors.toUnmodifiableSet());
    }

    private boolean matches(String rawPassword, String hash) {
        return hash != null && passwordEncoder.matches(rawPassword, hash);
    }

    private static String normalize(String account) {
        return account == null ? null : account.trim().toLowerCase();
    }

    private static String localeOr(String locale) {
        return locale == null || locale.isBlank() ? "en" : locale;
    }
}
