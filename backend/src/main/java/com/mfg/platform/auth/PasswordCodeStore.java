package com.mfg.platform.auth;

import com.mfg.common.cache.CacheKeys;
import com.mfg.common.service.RedisService;
import org.springframework.stereotype.Component;

/**
 * 改密码 / 忘记密码验证码在 Redis 里的两面：码的哈希 + 已试错次数。
 *
 * <p>结构和 {@link OtpCodeStore} 一样（为什么拆两个 key 见那边的注释），
 * 但 key 在<b>另一个命名空间</b>，且按用途再分：登录码、重置码、改密码码三者互不通用。
 */
@Component
class PasswordCodeStore {

    /** 用途。key 里用它区分，同一个人的重置码和改密码码也不能互用。 */
    enum Purpose {
        /** 忘记密码（未登录），subject = 邮箱哈希。 */
        RESET,
        /** 已登录改密码，subject = 受众 + 用户 id 的哈希。 */
        CHANGE
    }

    private final RedisService redis;

    PasswordCodeStore(RedisService redis) {
        this.redis = redis;
    }

    /** 写入一条新码。<b>覆盖旧码</b>（旧码立即作废），并把试错次数清零。 */
    void put(Purpose purpose, String subject, String codeHash, int ttlSeconds) {
        redis.set(CacheKeys.passwordCode(purpose.name(), subject), codeHash, ttlSeconds);
        redis.delete(CacheKeys.passwordCodeAttempts(purpose.name(), subject));
    }

    /** @return 码的哈希；没有或已过期返回 {@code null}。 */
    String codeHash(Purpose purpose, String subject) {
        return redis.get(CacheKeys.passwordCode(purpose.name(), subject), String.class);
    }

    /** 记一次尝试（比对之前就记），返回累计次数。为什么先记见 {@link OtpCodeStore#countAttempt}。 */
    int countAttempt(Purpose purpose, String subject, int ttlSeconds) {
        return (int) redis.increment(CacheKeys.passwordCodeAttempts(purpose.name(), subject), ttlSeconds);
    }

    /** 码对了：把这次尝试退回去 —— 码对了但新密码不合规时，用户改密码重交不该耗掉次数。 */
    void refundAttempt(Purpose purpose, String subject) {
        redis.decrement(CacheKeys.passwordCodeAttempts(purpose.name(), subject));
    }

    void clear(Purpose purpose, String subject) {
        // 出错要抛：删不掉 = 用过的码还能再用一次
        redis.deleteStrict(CacheKeys.passwordCode(purpose.name(), subject));
        redis.deleteStrict(CacheKeys.passwordCodeAttempts(purpose.name(), subject));
    }
}
