package com.mfg.platform.auth;

import com.mfg.common.cache.CacheKeys;
import com.mfg.common.exception.BusinessException;
import com.mfg.common.service.RateLimiter;
import com.mfg.common.service.RedisService;
import com.mfg.common.util.SensitiveData;
import com.mfg.platform.notification.NotificationException;
import com.mfg.platform.notification.NotificationRequest;
import com.mfg.platform.notification.NotificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * 登录验证码（OTP）：发码、校验、签发。
 *
 * <h3>它和密码登录的关系</h3>
 * <p>校验通过后走的是<b>同一个出口</b> {@link AuthTokenIssuer#login}，
 * 和 {@code AuthService.authenticateExternal} → 同一个 {@code TokenResponse}。
 * 加登录方式不等于加第二套签发逻辑（设计文档 2 §4 的 IdentityExchanger 意图）。
 *
 * <h3>三个不变量</h3>
 * <ol>
 *   <li><b>不泄露标识是否存在</b>：发码接口对「已注册」和「未注册」返回完全相同的响应。</li>
 *   <li><b>码一次性</b>：校验成功立刻删；连续错 {@value #MAX_ATTEMPTS} 次立刻作废。</li>
 *   <li><b>码不落明文</b>：Redis 里只有哈希，日志里只有打码后的标识。</li>
 * </ol>
 */
@Service
public class OtpService {

    private static final Logger log = LoggerFactory.getLogger(OtpService.class);

    /** 码的有效期（秒）。也是"错 5 次自动作废"里那个计数的 TTL。 */
    static final int CODE_TTL_SECONDS = 300;

    /** 一条码最多能错几次。到了就作废，必须重新发。 */
    static final int MAX_ATTEMPTS = 5;

    private static final int CODE_BOUND = 1_000_000;
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}$");
    private static final Pattern CODE = Pattern.compile("^\\d{6}$");
    private static final DateTimeFormatter UTC_DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd")
            .withZone(ZoneOffset.UTC);

    private final OtpCodeStore store;
    private final OtpEmailTemplate templates;
    private final NotificationService notifications;
    private final AuthService auth;
    private final AuthTokenIssuer tokenIssuer;
    private final RateLimiter rateLimiter;
    private final RedisService redis;
    private final SecureRandom random = new SecureRandom();

    private final int identifierLimit;
    private final int dailyBudget;

    public OtpService(OtpCodeStore store, OtpEmailTemplate templates,
                      NotificationService notifications, AuthService auth,
                      AuthTokenIssuer tokenIssuer, RateLimiter rateLimiter, RedisService redis,
                      @Value("${app.auth.otp.identifier-limit:20}") int identifierLimit,
                      // ★ 必须 ≤ 发信供应商的每日额度，否则熔断永远不触发：
                      //   数到 100 的时候 Resend 已经开始拒收，而我们还在数。
                      //   默认值取 Resend 免费档的 100/天。★ 如果同一个发信账号还要发别的邮件
                      //   （合同、通知），这里要调低，额度是共用的。
                      @Value("${app.auth.otp.daily-budget:100}") int dailyBudget) {
        this.store = store;
        this.templates = templates;
        this.notifications = notifications;
        this.auth = auth;
        this.tokenIssuer = tokenIssuer;
        this.rateLimiter = rateLimiter;
        this.redis = redis;
        this.identifierLimit = identifierLimit;
        this.dailyBudget = dailyBudget;
    }

    /** 校验结果：要么可以登录（带 token），要么邮箱已验证但还没注册。 */
    public record VerifyOutcome(boolean registrationRequired, TokenResponse token) {
    }

    // ---------- 发码 ----------

    /**
     * 生成并发送一条验证码。
     *
     * <p>★ 对「已注册」和「未注册」的标识，<b>行为完全一致</b>：都生成、都发、都返回成功。
     * 是否注册只在 {@link #verify} 里、<b>码校验通过之后</b>才区分 —— 那时对方已经证明
     * 自己能收到这个邮箱的邮件，不构成对第三方的信息泄露。
     */
    public void send(OtpChannel channel, String identifier, String localeHint) {
        String normalized = normalize(channel, identifier);
        requireChannelAvailable(channel);
        String identifierHash = sha256(normalized);

        // 第一层：同一标识 20 次 / 小时
        if (!rateLimiter.tryAcquire("otp-send", identifierHash, identifierLimit, Duration.ofHours(1))) {
            audit("send", channel, normalized, "rate_limited");
            throw new BusinessException(429, "auth.otp_rate_limited");
        }
        // 第二层（同 IP 20 次/小时）在控制器上用 @RateLimit 做，见 AuthOtpController。

        // 第三层：全局每日预算 —— 防有人用海量不同邮箱把发信额度刷爆（费用熔断）
        long used = redis.increment(
                CacheKeys.otpDailyBudget(channel.name(), UTC_DAY.format(Instant.now())), 24 * 3600);
        if (used > dailyBudget) {
            audit("send", channel, normalized, "budget_exhausted");
            throw new BusinessException(429, "auth.otp_rate_limited");
        }

        String code = String.format("%06d", random.nextInt(CODE_BOUND));
        store.put(channel, identifierHash, hashCode(identifierHash, code), CODE_TTL_SECONDS);

        // 语言：账号里存的优先（他选过），其次浏览器声明，最后英文
        String locale = auth.localeOf(normalized).filter(v -> !v.isBlank()).orElse(localeHint);
        String[] mail = templates.render(locale, code, CODE_TTL_SECONDS);
        try {
            notifications.sendNow(NotificationRequest.email(normalized, mail[0], mail[1]));
        } catch (NotificationException e) {
            // 码已经写进去了，但用户收不到 —— 删掉，免得占着"还能用"的状态
            store.clear(channel, identifierHash);
            audit("send", channel, normalized, "send_failed");
            throw new BusinessException(503, "auth.otp_send_failed");
        }
        audit("send", channel, normalized, "sent");
    }

    // ---------- 校验 ----------

    public VerifyOutcome verify(OtpChannel channel, String identifier, String code) {
        String normalized = consume(channel, identifier, code);
        Optional<AuthService.Authenticated> account = auth.findExternalByEmail(normalized);
        if (account.isEmpty()) {
            // 邮箱证明有效，但还没有账号。登录页据此引导去注册页；
            // 注册页走 {@link #verifyRegistration}，那条路径会真的建号。
            audit("verify", channel, normalized, "otp_ok_registration_required");
            return new VerifyOutcome(true, null);
        }

        AuthService.Authenticated authenticated = account.get();
        auth.markEmailVerified(authenticated.principal().id(), Instant.now());
        audit("verify", channel, normalized, "otp_ok_login");
        return new VerifyOutcome(false, tokenIssuer.login(authenticated));
    }

    /**
     * 注册场景：只校验并消费验证码，返回规整后的邮箱，<b>不查账号、不签发</b>。
     *
     * <p>建号由 {@code IdentityService} 负责 —— 这里不该知道"建的是组织还是人"。
     * 码一次性，消费后调用方必须自己完成建号，失败就只能让用户重新发码。
     */
    public String verifyRegistration(OtpChannel channel, String identifier, String code) {
        String normalized = consume(channel, identifier, code);
        audit("verify", channel, normalized, "otp_ok_registration");
        return normalized;
    }

    /**
     * 校验并消费一条码。登录和注册共用同一套规则：格式、过期、错次、常量时间比较。
     */
    private String consume(OtpChannel channel, String identifier, String code) {
        String normalized = normalize(channel, identifier);
        requireChannelAvailable(channel);
        if (code == null || !CODE.matcher(code).matches()) {
            throw new BusinessException(400, "auth.otp_code_invalid");
        }
        String identifierHash = sha256(normalized);

        String storedHash = store.codeHash(channel, identifierHash);
        if (storedHash == null) {
            audit("verify", channel, normalized, "expired_or_absent");
            throw new BusinessException(400, "auth.otp_expired");
        }
        if (store.attempts(channel, identifierHash) >= MAX_ATTEMPTS) {
            store.clear(channel, identifierHash);
            audit("verify", channel, normalized, "attempts_exhausted");
            throw new BusinessException(400, "auth.otp_expired");
        }

        // 常量时间比较 —— 别用 equals：它一旦发现不同就返回，比较耗时会泄漏"前几位对了"
        boolean ok = MessageDigest.isEqual(
                storedHash.getBytes(StandardCharsets.UTF_8),
                hashCode(identifierHash, code).getBytes(StandardCharsets.UTF_8));
        if (!ok) {
            int failures = store.recordFailure(channel, identifierHash, CODE_TTL_SECONDS);
            if (failures >= MAX_ATTEMPTS) {
                store.clear(channel, identifierHash);
                audit("verify", channel, normalized, "wrong_code_exhausted");
            } else {
                audit("verify", channel, normalized, "wrong_code");
            }
            throw new BusinessException(400, "auth.otp_code_incorrect");
        }

        // 一次性：成功即删，同一个码不能用第二次
        store.clear(channel, identifierHash);
        return normalized;
    }

    // ---------- 内部 ----------

    private static void requireChannelAvailable(OtpChannel channel) {
        if (channel != OtpChannel.EMAIL) {
            // 短信通道还没接。明确报"不可用"，不要假装发出去 —— 用户会一直等一条不会来的短信。
            throw new BusinessException(400, "auth.otp_channel_unavailable");
        }
    }

    private static String normalize(OtpChannel channel, String identifier) {
        if (channel != OtpChannel.EMAIL) {
            requireChannelAvailable(channel);
        }
        String v = identifier == null ? "" : identifier.trim().toLowerCase();
        if (v.isEmpty() || v.length() > 320 || !EMAIL.matcher(v).matches()) {
            throw new BusinessException(400, "auth.otp_identifier_invalid");
        }
        return v;
    }

    /**
     * 码的哈希：把标识一起拌进去，同一个码换个人用就不同，避免哈希可被跨账号复用。
     *
     * <p>package-private 是给同包测试用的（要能构造一条"已知码"而不必从邮件里读）。
     * 不要从包外调用它。
     */
    static String hashCode(String identifierHash, String code) {
        return sha256(identifierHash + ":" + code);
    }

    static String sha256(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /**
     * 审计：谁（打码后的标识）、何时、哪个渠道、结果。
     *
     * <p>★ 不记验证码本身，标识一律打码。当前没有审计表（{@code audit_event} 在 2026-09-08
     * 的迁移里连同旧模型一起删掉了），所以先落结构化日志；等审计表回来的时候，
     * 这里换成写表即可，调用点不用动。
     */
    private static void audit(String action, OtpChannel channel, String identifier, String result) {
        log.info("audit auth.otp.{} channel={} identifier={} result={}",
                action, channel, SensitiveData.maskEmail(identifier), result);
    }
}
