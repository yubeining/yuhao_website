package com.mfg.platform.auth;

import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.PartyType;
import com.mfg.common.security.UserPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * 账号密码认证 —— 按受众去<b>各自的表</b>查（运营 {@link OpsUser} / 外部 {@link PartyUser}），
 * 这正是 D23 拆表的收益：运营和外部物理隔离，一个查询不可能跨到另一边。
 *
 * <h3>失败一律 {@code auth.bad_credentials}</h3>
 * <p>账号不存在、密码错、被禁用、端不匹配 —— 对外都返同一个错，不告诉攻击者"这个账号存在
 * 但密码错"还是"账号不存在"（账号枚举防护）。
 *
 * <p>供应商本轮也走密码（临时）——设计里是手机验证码，等 OTP 那轮再换。
 */
@Service
public class AuthService {

    private static final String BAD_CREDENTIALS = "auth.bad_credentials";

    private final OpsUserRepository opsUsers;
    private final PartyUserRepository partyUsers;
    private final PartyRepository parties;
    private final PasswordEncoder passwordEncoder;

    public AuthService(OpsUserRepository opsUsers, PartyUserRepository partyUsers,
                       PartyRepository parties, PasswordEncoder passwordEncoder) {
        this.opsUsers = opsUsers;
        this.partyUsers = partyUsers;
        this.parties = parties;
        this.passwordEncoder = passwordEncoder;
    }

    /** 认证结果：principal + 展示名（登录响应要，principal 里不带）。 */
    public record Authenticated(UserPrincipal principal, String displayName) {
    }

    /**
     * 校验账号密码，成功返回结果并更新 last_login_at。
     *
     * @throws BusinessException 401 {@code auth.bad_credentials}
     */
    @Transactional
    public Authenticated authenticate(PartyType portal, String account, String rawPassword) {
        return portal == PartyType.OPERATOR
                ? authenticateOps(account, rawPassword)
                : authenticateExternal(portal, account, rawPassword);
    }

    /**
     * 按 (受众, userId) 重新加载 —— 刷新 token 时用，反映用户当前状态
     * （被禁用 / 被删的账号刷新会失败）。
     *
     * @throws BusinessException 401 {@code auth.bad_credentials}
     */
    @Transactional(readOnly = true)
    public Authenticated loadPrincipal(PartyType portal, UUID userId) {
        if (portal == PartyType.OPERATOR) {
            OpsUser ops = opsUsers.findById(userId).filter(u -> u.getStatus() == OpsUser.Status.ACTIVE)
                    .orElseThrow(() -> new BusinessException(401, BAD_CREDENTIALS));
            return new Authenticated(opsPrincipal(ops), ops.getDisplayName());
        }
        PartyUser user = partyUsers.findById(userId).filter(u -> "ACTIVE".equals(u.getStatus()))
                .orElseThrow(() -> new BusinessException(401, BAD_CREDENTIALS));
        Party party = requireMatchingParty(user, portal);
        return new Authenticated(externalPrincipal(user, party.getType()), user.getDisplayName());
    }

    // ---------- 运营 ----------

    private Authenticated authenticateOps(String account, String rawPassword) {
        OpsUser ops = opsUsers.findByEmailIgnoreCase(account).orElse(null);
        if (ops == null || ops.getStatus() != OpsUser.Status.ACTIVE
                || !matches(rawPassword, ops.getPasswordHash())) {
            throw new BusinessException(401, BAD_CREDENTIALS);
        }
        ops.setLastLoginAt(Instant.now());
        return new Authenticated(opsPrincipal(ops), ops.getDisplayName());
    }

    private UserPrincipal opsPrincipal(OpsUser ops) {
        // 运营无 partyId（D23）；本轮不发粗粒度角色，内部 RBAC 走 access_grant（后续）
        return new UserPrincipal(ops.getId(), null, PartyType.OPERATOR,
                ops.getEmail(), "zh", Set.of());
    }

    // ---------- 外部（客户 / 供应商）----------

    private Authenticated authenticateExternal(PartyType portal, String account, String rawPassword) {
        PartyUser user = lookupExternal(account).orElse(null);
        if (user == null || !"ACTIVE".equals(user.getStatus())
                || !matches(rawPassword, user.getPasswordHash())) {
            throw new BusinessException(401, BAD_CREDENTIALS);
        }
        Party party = requireMatchingParty(user, portal);
        user.setLastLoginAt(Instant.now());
        return new Authenticated(externalPrincipal(user, party.getType()), user.getDisplayName());
    }

    /** 账号可以是邮箱或手机（供应商多用手机）。 */
    private Optional<PartyUser> lookupExternal(String account) {
        Optional<PartyUser> byEmail = partyUsers.findByEmailIgnoreCase(account);
        return byEmail.isPresent() ? byEmail : partyUsers.findByPhone(account);
    }

    /** 校验这个人确实属于 portal 对应类型的 party，且 party 未被停用。 */
    private Party requireMatchingParty(PartyUser user, PartyType portal) {
        Party party = parties.findById(user.getPartyId())
                .orElseThrow(() -> new BusinessException(401, BAD_CREDENTIALS));
        if (!portal.name().equals(party.getType()) || "SUSPENDED".equals(party.getStatus())) {
            throw new BusinessException(401, BAD_CREDENTIALS);
        }
        return party;
    }

    private UserPrincipal externalPrincipal(PartyUser user, String partyType) {
        return new UserPrincipal(user.getId(), user.getPartyId(), PartyType.valueOf(partyType),
                user.getEmail(), user.getLocale(),
                user.getRole() == null ? Set.of() : Set.of(user.getRole()));
    }

    private boolean matches(String rawPassword, String hash) {
        // 没设密码（纯企微 / 纯验证码账号）不能用密码登录
        return hash != null && passwordEncoder.matches(rawPassword, hash);
    }
}
