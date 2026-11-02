package com.mfg.common.cache;

import java.util.UUID;

/**
 * 缓存 key 的集中目录。<b>禁止在业务代码里手写字符串拼接。</b>
 *
 * <p>为什么集中：失效时要按模式批量删（{@code deleteByPattern}），
 * 而写和删分散在两个文件里手拼字符串，早晚会对不上 ——
 * 写的时候是 {@code party:{id}:rfq:{id}}，删的时候写成 {@code party:{id}:rfqs:*}，
 * 缓存永远失效不掉，用户看到旧数据，而且没有任何报错。
 *
 * <p><b>租户范围的 key 必须带 {@code party:{partyId}:} 前缀</b>（CLAUDE.md §8）。
 * 少了它，A 客户的查询结果会被 B 客户读到 —— 这是最隐蔽的一类越权。
 */
public final class CacheKeys {

    private CacheKeys() {
    }

    // ---------- 通用 ----------

    /** {@code party:{partyId}:{段1}:{段2}...} */
    public static String partyScoped(UUID partyId, String... segments) {
        StringBuilder sb = new StringBuilder("party:").append(partyId);
        for (String s : segments) {
            sb.append(':').append(s);
        }
        return sb.toString();
    }

    /** 全局（非租户范围）的 key。用之前先问：这真的不该按 party 隔离吗？ */
    public static String global(String... segments) {
        return String.join(":", segments);
    }

    // ---------- 询价 ----------

    public static String rfq(UUID partyId, UUID rfqId) {
        return partyScoped(partyId, "rfq", rfqId.toString());
    }

    public static String rfqPattern(UUID partyId) {
        return partyScoped(partyId, "rfq", "*");
    }

    // ---------- 对客报价 ----------

    public static String quote(UUID partyId, UUID quoteId) {
        return partyScoped(partyId, "quote", quoteId.toString());
    }

    public static String quotePattern(UUID partyId) {
        return partyScoped(partyId, "quote", "*");
    }

    // ---------- 订单 ----------

    public static String order(UUID partyId, UUID orderId) {
        return partyScoped(partyId, "order", orderId.toString());
    }

    public static String orderPattern(UUID partyId) {
        return partyScoped(partyId, "order", "*");
    }

    // ---------- 汇率（全局，非租户范围）----------

    public static String fxRate(String base, String quote) {
        return global("fx", base, quote);
    }

    // ---------- 定价规则（全局）----------

    public static String activePricingRules() {
        return global("pricing", "rules", "active");
    }

    // ---------- 定时任务锁 ----------
    // 见 CLAUDE.md §9 —— 每个 @Scheduled 都要按条目加锁

    public static String schedulerLock(String job, String itemId) {
        return global("lock", "scheduler", job, itemId);
    }

    // ---------- 限流 ----------

    /** 公开端点按 IP 限流。用 hash 后的 IP，不存原始值。 */
    public static String publicRateLimit(String scope, String ipHash) {
        return global("ratelimit", scope, ipHash);
    }

    /**
     * 通用限流 key。{@code scope} = 被限的动作（如 {@code login} / {@code lead}），
     * {@code subject} = 被限的主体（邮箱 / ipHash / 手机号）。按"谁在做什么动作"计数。
     */
    public static String rateLimit(String scope, String subject) {
        return global("ratelimit", scope, subject);
    }

    // ---------- 认证 ----------

    /** refresh token 在 Redis 里的 key。 */
    public static String refreshToken(String token) {
        return global("auth", "refresh", token);
    }

    // ---------- 登录验证码（OTP）----------

    /**
     * 一条 OTP 的存储 key。{@code identifierHash} 是标识的 SHA-256 ——
     * <b>key 里不放邮箱原文</b>：Redis 的 key 会被 SCAN、监控和备份带走，
     * 那是 PII 的又一个副本，而且没有任何代码会去打码它。
     */
    public static String otpCode(String channel, String identifierHash) {
        return global("auth", "otp", "code", channel, identifierHash);
    }

    /** 同一条 OTP 的「已试错次数」。和码分开存 —— 码本身只写一次，不该为了记次数把 TTL 重置。 */
    public static String otpAttempts(String channel, String identifierHash) {
        return global("auth", "otp", "attempts", channel, identifierHash);
    }

    /** 全局每日发码预算（防发信被刷费用）。按 UTC 日期滚动。 */
    public static String otpDailyBudget(String channel, String utcDate) {
        return global("auth", "otp", "budget", channel, utcDate);
    }

    // ---------- 幂等（@Idempotent）----------

    /**
     * 幂等锁 key。{@code target} = 被保护的方法标识（类#方法），{@code arg} = 业务 key（SpEL 求值）。
     */
    public static String idempotency(String target, String arg) {
        return global("idempotent", target, arg);
    }
}
