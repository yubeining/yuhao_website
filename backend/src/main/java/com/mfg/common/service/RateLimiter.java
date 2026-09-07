package com.mfg.common.service;

import com.mfg.common.cache.CacheKeys;
import com.mfg.common.exception.BusinessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * 固定窗口限流 —— 防登录爆破、防公开端点被刷。
 *
 * <h3>怎么用</h3>
 * <p>调用方给 {@code scope}（被限的动作）+ {@code subject}（被限的主体）+ 限额 + 窗口：
 * <pre>
 *   // 同一邮箱 5 分钟最多试 10 次登录
 *   rateLimiter.enforce("login", email, 10, Duration.ofMinutes(5));
 *   // 同一 IP 1 小时最多提交 20 次留资
 *   if (!rateLimiter.tryAcquire("lead", ipHash, 20, Duration.ofHours(1))) { ... }
 * </pre>
 *
 * <h3>机制</h3>
 * <p>Redis 固定窗口计数：窗口内第一次请求把计数置 1 并设 TTL=窗口长度，之后每次 +1，
 * 超过限额即拒。窗口到期 key 自动消失、计数归零。实现靠 {@link RedisService#increment}
 * （只在计数为 1 时设 TTL，天然就是固定窗口）。
 *
 * <p><b>固定窗口的已知边界</b>：窗口交界处可能出现短时突发（上个窗口尾 + 下个窗口头）。
 * 对"防爆破/防滥用"这个目的足够；要严格平滑再上滑动窗口/令牌桶，现在不值当。
 *
 * <h3>Redis 挂了怎么办：fail-open</h3>
 * <p>Redis 不可用时<b>放行</b>并记 warn —— 限流是"锦上添花"的防护，不该因为它的依赖抖动
 * 就把所有人的登录/请求全拦死（那是把可用性赌在一个非核心组件上）。真正不能失守的一致性
 * （如接单唯一性）另有 DB 唯一约束兜底，不靠限流。
 */
@Service
public class RateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RateLimiter.class);

    private final RedisService redis;

    public RateLimiter(RedisService redis) {
        this.redis = redis;
    }

    /**
     * @return true = 放行（未超限）；false = 超限，调用方自己决定怎么拒
     */
    public boolean tryAcquire(String scope, String subject, int limit, Duration window) {
        String key = CacheKeys.rateLimit(scope, subject);
        try {
            long count = redis.increment(key, (int) window.getSeconds());
            return count <= limit;
        } catch (RuntimeException e) {
            // fail-open：限流依赖抖动不该拦死正常请求
            log.warn("rate limiter unavailable, allowing through: scope={}", scope);
            return true;
        }
    }

    /**
     * 超限直接抛 429。适合"要么放行要么拒"的场景，省掉调用方写 if。
     *
     * @throws BusinessException 429 {@code common.rate_limited}
     */
    public void enforce(String scope, String subject, int limit, Duration window) {
        if (!tryAcquire(scope, subject, limit, window)) {
            log.warn("rate limit exceeded: scope={} limit={}/{}s", scope, limit, window.getSeconds());
            throw new BusinessException(429, "common.rate_limited");
        }
    }
}
