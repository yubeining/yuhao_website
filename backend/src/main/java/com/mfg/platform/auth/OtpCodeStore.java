package com.mfg.platform.auth;

import com.mfg.common.cache.CacheKeys;
import com.mfg.common.service.RedisService;
import org.springframework.stereotype.Component;

/**
 * 一条 OTP 在 Redis 里的两面：<b>码的哈希</b> 和 <b>已试错次数</b>。
 *
 * <h3>为什么拆成两个 key</h3>
 * <p>{@link RedisService#set} 每次写都会<b>重置 TTL</b>。如果"码 + 次数"存在同一个值里，
 * 那么每错一次都要重写这个值，码的有效期就被一次次续到满 —— 攻击者可以靠不停试错
 * 让一条码永远不过期。次数单独用一个自增计数（只在第一次设 TTL）就没有这个问题。
 *
 * <h3>存的是什么</h3>
 * <p>存的是码的哈希，不是码本身；key 里是标识的哈希，不是邮箱原文。
 * Redis 的 key 和 value 都会被 SCAN、监控、备份带走，两处都不该出现 PII 或明文凭据。
 */
@Component
class OtpCodeStore {

    private final RedisService redis;

    OtpCodeStore(RedisService redis) {
        this.redis = redis;
    }

    /** 写入一条新码。重复发码<b>覆盖旧码</b>，并把上一轮的试错次数清零。 */
    void put(OtpChannel channel, String identifierHash, String codeHash, int ttlSeconds) {
        redis.set(CacheKeys.otpCode(channel.name(), identifierHash), codeHash, ttlSeconds);
        redis.delete(CacheKeys.otpAttempts(channel.name(), identifierHash));
    }

    /** @return 码的哈希；没有这条码或已过期返回 {@code null}。 */
    String codeHash(OtpChannel channel, String identifierHash) {
        return redis.get(CacheKeys.otpCode(channel.name(), identifierHash), String.class);
    }

    int attempts(OtpChannel channel, String identifierHash) {
        Integer n = redis.get(CacheKeys.otpAttempts(channel.name(), identifierHash), Integer.class);
        return n == null ? 0 : n;
    }

    /** 记一次失败，返回累计次数。 */
    int recordFailure(OtpChannel channel, String identifierHash, int ttlSeconds) {
        long n = redis.increment(CacheKeys.otpAttempts(channel.name(), identifierHash), ttlSeconds);
        return (int) n;
    }

    /** 一次性：校验成功、或试错次数用尽、或要作废时，两个 key 一起删。 */
    void clear(OtpChannel channel, String identifierHash) {
        redis.delete(CacheKeys.otpCode(channel.name(), identifierHash));
        redis.delete(CacheKeys.otpAttempts(channel.name(), identifierHash));
    }
}
