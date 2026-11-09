package com.mfg.platform.identity;

import com.mfg.common.dto.PageQuery;
import com.mfg.common.dto.PagedResponse;
import com.mfg.common.exception.BusinessException;
import com.mfg.platform.identity.dto.AccountView;
import com.mfg.platform.identity.dto.OrganizationAdminView;
import com.mfg.platform.identity.dto.StaffView;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 运营端的账号管理：外部用户（客户 / 供应商联系人）、组织（公司）、运营账号。
 *
 * <h3>「删除」是禁用，不是物理删除</h3>
 * <p>2026-11-09 需求方决定：不做物理删除，逻辑删除用 {@code status = DISABLED} 表达。
 * 数据库里没有 {@code is_delete} 列，也不需要 —— 登录路径本来就在校验 {@code status}，
 * 多一个平行字段只会让「这条到底算不算删了」有两处答案。
 *
 * <p>★ 代价要知道：{@code DISABLED} 同时承担「临时禁用」和「删除」两种语义，
 * 界面上是两个按钮，数据上是同一个状态。要分开必须加列并给所有查询补过滤条件。
 *
 * <h3>为什么单独一个 service</h3>
 * <p>{@link IdentityService} 管的是「注册 / 登录 / 读自己公司」这条自助链路；
 * 这里是运营跨租户的管理动作。混在一起会让两个方向的权限假设互相污染
 * （自助链路的每个方法都必须带 orgId 条件，运营这边本来就不带）。
 */
@Service
public class AccountAdminService {

    private static final int PASSWORD_MIN = 8;
    private static final int PASSWORD_MAX = 100;

    private final ExternalUserRepository externalUsers;
    private final OpsUserRepository opsUsers;
    private final OrganizationRepository organizations;
    private final PasswordEncoder passwordEncoder;

    public AccountAdminService(ExternalUserRepository externalUsers, OpsUserRepository opsUsers,
                               OrganizationRepository organizations, PasswordEncoder passwordEncoder) {
        this.externalUsers = externalUsers;
        this.opsUsers = opsUsers;
        this.organizations = organizations;
        this.passwordEncoder = passwordEncoder;
    }

    // ---------- 外部用户 ----------

    @Transactional(readOnly = true)
    public PagedResponse<AccountView> listExternalUsers(String query, PageQuery page) {
        Page<ExternalUser> users = hasText(query)
                ? externalUsers.search(like(query), page.toPageable())
                : externalUsers.findAll(page.toPageable());
        Map<UUID, Organization> orgs = orgMap(users.getContent(), ExternalUser::getOrgId);
        return PagedResponse.of(users, u -> AccountView.of(u, orgs.get(u.getOrgId())));
    }

    /** 某家公司下的全部联系人（运营端查看公司详情时用）。 */
    @Transactional(readOnly = true)
    public PagedResponse<AccountView> listExternalUsersOfOrg(UUID orgId, PageQuery page) {
        Organization org = requireOrg(orgId);
        Page<ExternalUser> users = externalUsers.findByOrgIdOrderByCreatedAtDesc(orgId, page.toPageable());
        return PagedResponse.of(users, u -> AccountView.of(u, org));
    }

    @Transactional(readOnly = true)
    public AccountView getExternalUser(UUID id) {
        ExternalUser u = requireExternalUser(id);
        return AccountView.of(u, organizations.findById(u.getOrgId()).orElse(null));
    }

    @Transactional
    public AccountView createExternalUser(UUID orgId, String email, String displayName,
                                          String rawPassword, String locale) {
        Organization org = requireOrg(orgId);
        if (org.getType() == Organization.Type.INTERNAL) {
            // 内部组织下不该挂外部用户：那会让一个「客户」登录后拿到 INTERNAL 的受众判断
            throw new BusinessException(400, "account.org_type_invalid");
        }
        String normalized = normalizeEmail(email);
        if (externalUsers.existsByEmail(normalized)) {
            throw new BusinessException(409, "account.email_taken");
        }
        ExternalUser user = new ExternalUser(orgId, normalized, displayName.trim(),
                passwordEncoder.encode(requirePassword(rawPassword)));
        user.setLocale(trimToNull(locale));
        return AccountView.of(externalUsers.save(user), org);
    }

    /** 只改姓名 / 语言 / 状态。邮箱和所属公司不可改（2026-11-09 决定）。 */
    @Transactional
    public AccountView updateExternalUser(UUID id, String displayName, String locale, String status) {
        ExternalUser u = requireExternalUser(id);
        if (hasText(displayName)) {
            u.setDisplayName(displayName.trim());
        }
        u.setLocale(trimToNull(locale));
        if (hasText(status)) {
            u.setStatus(parseStatus(status, ExternalUser.Status.class));
        }
        return AccountView.of(externalUsers.save(u), organizations.findById(u.getOrgId()).orElse(null));
    }

    @Transactional
    public AccountView disableExternalUser(UUID id) {
        ExternalUser u = requireExternalUser(id);
        u.setStatus(ExternalUser.Status.DISABLED);
        return AccountView.of(externalUsers.save(u), organizations.findById(u.getOrgId()).orElse(null));
    }

    // ---------- 组织 ----------

    @Transactional(readOnly = true)
    public PagedResponse<OrganizationAdminView> listOrganizations(String query, String type, PageQuery page) {
        Organization.Type parsedType = hasText(type) ? parseOrgType(type) : null;
        Pageable p = page.toPageable();
        Page<Organization> result;
        if (parsedType != null && hasText(query)) {
            result = organizations.findByTypeAndNameContainingIgnoreCaseOrderByCreatedAtDesc(
                    parsedType, query.trim(), p);
        } else if (parsedType != null) {
            result = organizations.findByTypeOrderByCreatedAtDesc(parsedType, p);
        } else if (hasText(query)) {
            result = organizations.findByNameContainingIgnoreCaseOrderByCreatedAtDesc(query.trim(), p);
        } else {
            result = organizations.findByOrderByCreatedAtDesc(p);
        }
        return PagedResponse.of(result, OrganizationAdminView::of);
    }

    @Transactional(readOnly = true)
    public OrganizationAdminView getOrganization(UUID id) {
        return OrganizationAdminView.of(requireOrg(id));
    }

    @Transactional
    public OrganizationAdminView createOrganization(String type, String name, String country) {
        if (!hasText(name)) {
            throw new BusinessException(400, "organization.name_required");
        }
        Organization org = new Organization(parseOrgType(type), name.trim(), trimToNull(country));
        return OrganizationAdminView.of(organizations.save(org));
    }

    /** 只改名称 / 国家 / 状态。**类型不可改** —— 改类型等于改受众，权限全变（2026-11-09 决定）。 */
    @Transactional
    public OrganizationAdminView updateOrganization(UUID id, String name, String country, String status) {
        Organization org = requireOrg(id);
        if (hasText(name)) {
            org.setName(name.trim());
        }
        org.setCountry(trimToNull(country));
        if (hasText(status)) {
            org.setStatus(parseStatus(status, Organization.Status.class));
        }
        return OrganizationAdminView.of(organizations.save(org));
    }

    @Transactional
    public OrganizationAdminView disableOrganization(UUID id) {
        Organization org = requireOrg(id);
        org.setStatus(Organization.Status.DISABLED);
        return OrganizationAdminView.of(organizations.save(org));
    }

    // ---------- 运营账号 ----------

    @Transactional(readOnly = true)
    public PagedResponse<StaffView> listStaff(String query, PageQuery page) {
        Page<OpsUser> users = hasText(query)
                ? opsUsers.search(like(query), page.toPageable())
                : opsUsers.findAll(page.toPageable());
        Map<UUID, Organization> orgs = orgMap(users.getContent(), OpsUser::getOrgId);
        return PagedResponse.of(users, u -> StaffView.of(u, orgs.get(u.getOrgId())));
    }

    @Transactional(readOnly = true)
    public StaffView getStaff(UUID id) {
        OpsUser u = requireStaff(id);
        return StaffView.of(u, organizations.findById(u.getOrgId()).orElse(null));
    }

    /**
     * 建运营账号。
     *
     * <p>★ 2026-11-09 需求方决定：暂不做 ADMIN 角色，<b>任何运营都能建运营账号</b>。
     * 已知风险：拿到 OPERATOR token 的人可以无限造后台账号 —— 这是提权通道。
     * 等 ADMIN 角色落地时，这个端点要一起收口。
     *
     * <p>{@code orgId} 必须是 INTERNAL 组织；运营账号不挂在客户 / 供应商组织下。
     */
    @Transactional
    public StaffView createStaff(UUID orgId, String email, String displayName,
                                 String rawPassword, String locale) {
        Organization org = requireOrg(orgId);
        if (org.getType() != Organization.Type.INTERNAL) {
            throw new BusinessException(400, "staff.org_type_invalid");
        }
        String normalized = normalizeEmail(email);
        if (opsUsers.existsByEmail(normalized) || externalUsers.existsByEmail(normalized)) {
            // 两张表物理隔离，但邮箱在「人的身份」这一层应当是唯一的：
            // 否则同一个邮箱既是客户又是运营，登录走哪条路全看调用哪个端点。
            throw new BusinessException(409, "account.email_taken");
        }
        OpsUser user = new OpsUser(orgId, normalized, displayName.trim(),
                passwordEncoder.encode(requirePassword(rawPassword)));
        user.setLocale(trimToNull(locale));
        return StaffView.of(opsUsers.save(user), org);
    }

    @Transactional
    public StaffView updateStaff(UUID id, String displayName, String locale, String status) {
        OpsUser u = requireStaff(id);
        if (hasText(displayName)) {
            u.setDisplayName(displayName.trim());
        }
        u.setLocale(trimToNull(locale));
        if (hasText(status)) {
            u.setStatus(parseStatus(status, OpsUser.Status.class));
        }
        return StaffView.of(opsUsers.save(u), organizations.findById(u.getOrgId()).orElse(null));
    }

    @Transactional
    public StaffView disableStaff(UUID id) {
        OpsUser u = requireStaff(id);
        u.setStatus(OpsUser.Status.DISABLED);
        return StaffView.of(opsUsers.save(u), organizations.findById(u.getOrgId()).orElse(null));
    }

    // ---------- 内部 ----------

    private <T> Map<UUID, Organization> orgMap(List<T> items, Function<T, UUID> orgIdOf) {
        List<UUID> ids = items.stream().map(orgIdOf).filter(java.util.Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return organizations.findAllById(ids).stream()
                .collect(Collectors.toMap(Organization::getId, Function.identity()));
    }

    private ExternalUser requireExternalUser(UUID id) {
        return externalUsers.findById(id).orElseThrow(() -> new BusinessException(404, "account.not_found"));
    }

    private OpsUser requireStaff(UUID id) {
        return opsUsers.findById(id).orElseThrow(() -> new BusinessException(404, "staff.not_found"));
    }

    private Organization requireOrg(UUID id) {
        return organizations.findById(id).orElseThrow(() -> new BusinessException(404, "organization.not_found"));
    }

    private static String requirePassword(String raw) {
        if (raw == null || raw.length() < PASSWORD_MIN || raw.length() > PASSWORD_MAX) {
            throw new BusinessException(400, "auth.password_invalid");
        }
        return raw;
    }

    private static String normalizeEmail(String email) {
        if (email == null || email.isBlank()) {
            throw new BusinessException(400, "auth.email_invalid");
        }
        return email.trim().toLowerCase();
    }

    private static String like(String query) {
        return "%" + query.trim().toLowerCase() + "%";
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }

    private static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static Organization.Type parseOrgType(String raw) {
        try {
            return Organization.Type.valueOf(raw.trim().toUpperCase());
        } catch (RuntimeException e) {
            throw new BusinessException(400, "organization.type_invalid");
        }
    }

    private static <E extends Enum<E>> E parseStatus(String raw, Class<E> type) {
        try {
            return Enum.valueOf(type, raw.trim().toUpperCase());
        } catch (RuntimeException e) {
            throw new BusinessException(400, "account.status_invalid");
        }
    }
}
