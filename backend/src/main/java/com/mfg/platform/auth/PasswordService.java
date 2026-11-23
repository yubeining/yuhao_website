package com.mfg.platform.auth;

import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.PartyType;
import com.mfg.common.security.UserPrincipal;
import com.mfg.common.util.SensitiveData;
import com.mfg.platform.notification.NotificationException;
import com.mfg.platform.notification.NotificationRequest;
import com.mfg.platform.notification.NotificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * 忘记密码（客户 / 供应商）与已登录改密码（三端）。都凭<b>邮件验证码</b>证明身份。
 *
 * <p>规则全部来自需求方 2026-11-23 的回复（changelog/2026-11-23_password-reset），不是工程取值：
 * 码 5 分钟有效、错 5 次作废、重新申请旧码作废、申请不设次数限制、不计发信每日预算、
 * 改密 / 重置后所有设备都要重新登录、重置成功直接登录、改完发通知邮件。
 *
 * <h3>不泄露账号是否存在</h3>
 * <p>忘记密码的申请对任何邮箱都返回同样的结果。码只发给可用的外部账号，
 * 所以发信走<b>异步</b>（{@link NotificationService#notify}）：同步发的话，
 * 存在的账号会多一次外部 HTTP 往返，响应时间本身就泄露了账号是否存在。
 */
@Service
class PasswordService {

    private static final Logger log = LoggerFactory.getLogger(PasswordService.class);

    /** 码的有效期：5 分钟（需求方 2026-11-23）。 */
    static final int CODE_TTL_SECONDS = 300;

    /** 一条码最多错几次（需求方 2026-11-23：保留和登录验证码一样的 5 次）。 */
    static final int MAX_ATTEMPTS = 5;

    private static final int CODE_BOUND = 1_000_000;
    private static final Pattern CODE = Pattern.compile("^\\d{6}$");

    private final PasswordCodeStore store;
    private final OtpEmailTemplate templates;
    private final NotificationService notifications;
    private final AuthService auth;
    private final AuthTokenIssuer tokenIssuer;
    private final RefreshTokenService refreshTokens;
    private final SecureRandom random = new SecureRandom();

    PasswordService(PasswordCodeStore store, OtpEmailTemplate templates, NotificationService notifications,
                    AuthService auth, AuthTokenIssuer tokenIssuer, RefreshTokenService refreshTokens) {
        this.store = store;
        this.templates = templates;
        this.notifications = notifications;
        this.auth = auth;
        this.tokenIssuer = tokenIssuer;
        this.refreshTokens = refreshTokens;
    }

    // ---------- 忘记密码 ----------

    /**
     * 申请重置码。账号不存在 / 被禁用 / 组织停用 / 是运营邮箱 —— 什么都不做，也不报错。
     * 有没有密码都发（需求方 2026-11-23：没设过密码的账号可以借这个流程设第一个密码）。
     */
    void sendResetCode(String email, String localeHint) {
        String normalized = normalize(email);
        Optional<AuthService.Authenticated> account = auth.findExternalByEmail(normalized);
        if (account.isEmpty()) {
            audit("reset_request", normalized, "no_account");
            return;
        }
        String subject = resetSubject(normalized);
        String code = newCode(PasswordCodeStore.Purpose.RESET, subject);
        String locale = Optional.ofNullable(account.get().principal().locale()).orElse(localeHint);
        notifications.notify(codeEmail(normalized, locale, code));
        audit("reset_request", normalized, "sent");
    }

    /** 凭重置码设新密码，成功后吊销该账号全部会话并直接登录（返回新登录态）。 */
    TokenResponse reset(String email, String code, String newPassword) {
        String normalized = normalize(email);
        String subject = resetSubject(normalized);
        verify(PasswordCodeStore.Purpose.RESET, subject, code, normalized);

        AuthService.Authenticated account = auth.findExternalByEmail(normalized).orElseThrow(() -> {
            // 码发出之后账号被禁用 / 组织被停用：当作码无效，不说明原因
            store.clear(PasswordCodeStore.Purpose.RESET, subject);
            return new BusinessException(400, "auth.otp_expired");
        });
        UserPrincipal p = account.principal();
        // 新密码不合规时抛异常，码还留着 —— 用户改一下密码再提交即可，不用重新收邮件
        auth.setPassword(p.partyType(), p.id(), newPassword);
        store.clear(PasswordCodeStore.Purpose.RESET, subject);

        refreshTokens.revokeAll(p.partyType(), p.id());
        auth.markEmailVerified(p.id(), Instant.now());
        notifications.notify(changedEmail(normalized, p.locale()));
        audit("reset", normalized, "ok");
        return tokenIssuer.login(account);
    }

    // ---------- 已登录改密码 ----------

    /** 向本人账号邮箱发改密码验证码。同步发：发不出去要当场告诉用户，不能让他干等。 */
    void sendChangeCode(UserPrincipal principal, String localeHint) {
        String subject = changeSubject(principal.partyType(), principal.id());
        String code = newCode(PasswordCodeStore.Purpose.CHANGE, subject);
        String locale = Optional.ofNullable(principal.locale()).orElse(localeHint);
        try {
            notifications.sendNow(codeEmail(principal.email(), locale, code));
        } catch (NotificationException e) {
            store.clear(PasswordCodeStore.Purpose.CHANGE, subject);
            audit("change_request", principal.email(), "send_failed");
            throw new BusinessException(503, "auth.otp_send_failed");
        }
        audit("change_request", principal.email(), "sent");
    }

    /** 凭改密码验证码设新密码，成功后吊销该账号全部会话（含当前设备）。 */
    void change(UserPrincipal principal, String code, String newPassword) {
        String subject = changeSubject(principal.partyType(), principal.id());
        verify(PasswordCodeStore.Purpose.CHANGE, subject, code, principal.email());
        auth.setPassword(principal.partyType(), principal.id(), newPassword);
        store.clear(PasswordCodeStore.Purpose.CHANGE, subject);

        refreshTokens.revokeAll(principal.partyType(), principal.id());
        notifications.notify(changedEmail(principal.email(), principal.locale()));
        audit("change", principal.email(), "ok");
    }

    // ---------- 码 ----------

    private String newCode(PasswordCodeStore.Purpose purpose, String subject) {
        String code = String.format("%06d", random.nextInt(CODE_BOUND));
        store.put(purpose, subject, OtpService.hashCode(subject, code), CODE_TTL_SECONDS);
        return code;
    }

    /**
     * 校验码，<b>成功时不删</b> —— 由调用方在新密码写入成功后再删，
     * 这样新密码不合规时用户不用重新收邮件。失败计次、到 {@value #MAX_ATTEMPTS} 次作废。
     */
    private void verify(PasswordCodeStore.Purpose purpose, String subject, String code, String who) {
        if (code == null || !CODE.matcher(code).matches()) {
            throw new BusinessException(400, "auth.otp_code_invalid");
        }
        String storedHash = store.codeHash(purpose, subject);
        if (storedHash == null) {
            audit(purpose.name().toLowerCase(), who, "expired_or_absent");
            throw new BusinessException(400, "auth.otp_expired");
        }
        if (store.attempts(purpose, subject) >= MAX_ATTEMPTS) {
            store.clear(purpose, subject);
            throw new BusinessException(400, "auth.otp_expired");
        }
        boolean ok = MessageDigest.isEqual(
                storedHash.getBytes(StandardCharsets.UTF_8),
                OtpService.hashCode(subject, code).getBytes(StandardCharsets.UTF_8));
        if (!ok) {
            if (store.recordFailure(purpose, subject, CODE_TTL_SECONDS) >= MAX_ATTEMPTS) {
                store.clear(purpose, subject);
                audit(purpose.name().toLowerCase(), who, "wrong_code_exhausted");
            } else {
                audit(purpose.name().toLowerCase(), who, "wrong_code");
            }
            throw new BusinessException(400, "auth.otp_code_incorrect");
        }
    }

    /** 重置码的 subject：规整后邮箱的哈希。package-private 给同包测试放"已知码"用。 */
    static String resetSubject(String email) {
        return OtpService.sha256(normalize(email));
    }

    /** 改密码码的 subject：受众 + 用户 id 的哈希。 */
    static String changeSubject(PartyType portal, java.util.UUID userId) {
        return OtpService.sha256(portal.name() + ":" + userId);
    }

    // ---------- 邮件 ----------

    private NotificationRequest codeEmail(String to, String locale, String code) {
        String[] mail = templates.renderNamed("password-code-email", locale,
                Map.of("code", code, "minutes", String.valueOf(CODE_TTL_SECONDS / 60)));
        return NotificationRequest.email(to, mail[0], mail[1]);
    }

    private NotificationRequest changedEmail(String to, String locale) {
        String[] mail = templates.renderNamed("password-changed-email", locale, Map.of());
        return NotificationRequest.email(to, mail[0], mail[1]);
    }

    // ---------- 内部 ----------

    /** 与 {@code AuthService.normalize()} 同一套规整（trim + toLowerCase），两边不一致就查不到人。 */
    private static String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }

    /** 审计：落结构化日志（当前无审计表，同 OtpService）。不记码，邮箱打码。 */
    private static void audit(String action, String email, String result) {
        log.info("audit auth.password.{} identifier={} result={}",
                action, SensitiveData.maskEmail(email), result);
    }
}
