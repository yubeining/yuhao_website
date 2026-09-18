package com.mfg.platform.identity;

import com.mfg.common.exception.BusinessException;
import com.mfg.platform.identity.dto.SupplierInviteCheckView;
import com.mfg.platform.identity.dto.SupplierInviteView;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/**
 * 供应商入驻：运营发邀请，供应商凭链接注册（2026-09-18 需求方拍板，设计文档 11）。
 *
 * <p>链接 7 天有效、用一次就失效、运营可随时作废（需求方定的数，不是配置项）。
 * 注册邮箱就是邀请上的那个 —— 推导，不是给定的：防止链接被转给别人注册。
 * 链接明文只在 {@link #create} 的返回里出现一次，库里只存 SHA-256。
 */
@Service
public class SupplierInviteService {

    static final Duration VALIDITY = Duration.ofDays(7);
    private static final int TOKEN_BYTES = 32;
    private static final String INVALID = "auth.invite_invalid";

    private final SupplierInviteRepository invites;
    private final OrganizationRepository organizations;
    private final ExternalUserRepository externalUsers;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom random = new SecureRandom();

    public SupplierInviteService(SupplierInviteRepository invites, OrganizationRepository organizations,
                                 ExternalUserRepository externalUsers, PasswordEncoder passwordEncoder) {
        this.invites = invites;
        this.organizations = organizations;
        this.externalUsers = externalUsers;
        this.passwordEncoder = passwordEncoder;
    }

    /** 邮箱已经有账号的不发邀请（409），免得发出去一条注定注册失败的链接。 */
    @Transactional
    public SupplierInviteView create(UUID opsUserId, String orgName, String email) {
        String normalized = IdentityService.normalizeEmail(email);
        if (externalUsers.existsByEmail(normalized)) {
            throw new BusinessException(409, "auth.email_taken");
        }
        byte[] raw = new byte[TOKEN_BYTES];
        random.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        Instant now = Instant.now();
        SupplierInvite saved = invites.save(
                new SupplierInvite(hash(token), orgName.trim(), normalized, now.plus(VALIDITY), opsUserId));
        return view(saved, now, token);
    }

    @Transactional(readOnly = true)
    public List<SupplierInviteView> list() {
        Instant now = Instant.now();
        return invites.findAllByOrderByCreatedAtDesc().stream().map(i -> view(i, now, null)).toList();
    }

    /** 已用掉的作废不了（409）；已作废的再作废不报错。 */
    @Transactional
    public SupplierInviteView revoke(UUID inviteId) {
        SupplierInvite invite = invites.findById(inviteId)
                .orElseThrow(() -> BusinessException.notFound("auth.invite_not_found"));
        if (invite.getUsedAt() != null) {
            throw BusinessException.conflict("auth.invite_used");
        }
        invites.revoke(inviteId, Instant.now());
        return view(invites.findById(inviteId).orElseThrow(), Instant.now(), null);
    }

    /** 公开：凭链接查。无效（不存在 / 过期 / 用过 / 作废）一律 410，不区分原因。 */
    @Transactional(readOnly = true)
    public SupplierInviteCheckView check(String token) {
        SupplierInvite invite = requireUsable(token, Instant.now());
        return new SupplierInviteCheckView(invite.getOrgName(), invite.getEmail(), invite.getExpiresAt());
    }

    /**
     * 公开：凭链接注册。建 SUPPLIER 组织 + 首个用户，并把邀请标成已用 —— 同一个事务，
     * 任何一步失败（邮箱已被占、并发时别人先用掉）都整体回滚，邀请不会被白白消耗。
     */
    @Transactional
    public ExternalUser register(String token, String orgName, String displayName, String password) {
        Instant now = Instant.now();
        SupplierInvite invite = requireUsable(token, now);
        if (externalUsers.existsByEmail(invite.getEmail())) {
            throw new BusinessException(409, "auth.email_taken");
        }
        Organization org = organizations.save(new Organization(Organization.Type.SUPPLIER, orgName.trim(), null));
        if (invites.consume(invite.getId(), org.getId(), now) != 1) {
            throw new BusinessException(410, INVALID);
        }
        return externalUsers.save(new ExternalUser(org.getId(), invite.getEmail(), displayName.trim(),
                passwordEncoder.encode(password)));
    }

    private SupplierInvite requireUsable(String token, Instant now) {
        SupplierInvite invite = invites.findByTokenHash(hash(token))
                .orElseThrow(() -> new BusinessException(410, INVALID));
        if (invite.statusAt(now) != SupplierInvite.Status.PENDING) {
            throw new BusinessException(410, INVALID);
        }
        return invite;
    }

    private static SupplierInviteView view(SupplierInvite i, Instant now, String token) {
        return new SupplierInviteView(i.getId(), i.getOrgName(), i.getEmail(), i.statusAt(now).name(),
                i.getExpiresAt(), i.getUsedAt(), i.getRevokedAt(), i.getCreatedAt(), token);
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
