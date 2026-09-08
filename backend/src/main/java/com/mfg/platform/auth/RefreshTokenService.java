package com.mfg.platform.auth;

import com.mfg.common.cache.CacheKeys;
import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.PartyType;
import com.mfg.common.service.RedisService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Refresh token —— 不透明随机串，存 Redis，可轮换、可撤销（D22）。
 *
 * <h3>为什么不用 JWT 做 refresh</h3>
 * <p>access token 是无状态 JWT（2 小时，短），签出去就没法撤销 —— 短命所以可接受。
 * refresh token 活 30 天，必须能撤销（登出、被盗）。撤销需要状态，所以 refresh 存 Redis：
 * key 在就有效，删掉即失效。轮换 = 每次刷新换一个新的、旧的立即作废（旧 refresh 被盗后
 * 只要正主刷新过一次，盗用者手里那个就废了）。
 *
 * <p>值里只存 {@code 受众:userId}，刷新时据此<b>重新从库加载</b> principal —— 反映用户当前
 * 状态（被禁用的账号刷新会失败），不把可能过期的角色/身份塞进 token 里带 30 天。
 */
@Service
public class RefreshTokenService {

    private final RedisService redis;
    private final int ttlSeconds;

    public RefreshTokenService(RedisService redis,
                               @Value("${app.jwt.refresh-token-ttl-seconds:2592000}") int ttlSeconds) {
        this.redis = redis;
        this.ttlSeconds = ttlSeconds;
    }

    /** 签发一个新 refresh token 并落 Redis。 */
    public String issue(PartyType portal, UUID userId) {
        String token = UUID.randomUUID().toString().replace("-", "");
        redis.set(CacheKeys.refreshToken(token), portal.name() + ":" + userId, ttlSeconds);
        return token;
    }

    /** 一个 refresh token 解出来的身份坐标。 */
    public record Resolved(PartyType portal, UUID userId) {
    }

    /** 轮换结果：解出的旧身份 + 新签发的 token。 */
    public record Rotation(Resolved resolved, String newToken) {
    }

    /**
     * 消费旧 token（校验 + 删除）并签发新 token。
     *
     * @throws BusinessException 401 {@code auth.refresh_invalid}（不存在 / 已用过 / 已撤销 / 过期）
     */
    public Rotation rotate(String oldToken) {
        Resolved resolved = consume(oldToken);
        return new Rotation(resolved, issue(resolved.portal(), resolved.userId()));
    }

    /** 撤销（登出）。已经不存在也无所谓（幂等）。 */
    public void revoke(String token) {
        if (token != null && !token.isBlank()) {
            redis.delete(CacheKeys.refreshToken(token));
        }
    }

    private Resolved consume(String token) {
        if (token == null || token.isBlank()) {
            throw new BusinessException(401, "auth.refresh_invalid");
        }
        String value = redis.get(CacheKeys.refreshToken(token), String.class);
        if (value == null) {
            throw new BusinessException(401, "auth.refresh_invalid");
        }
        // 立即删除 = 一次性 + 轮换（并发同 token 刷新极端下可能都读到，属可接受的小窗口）
        redis.delete(CacheKeys.refreshToken(token));
        int sep = value.indexOf(':');
        if (sep <= 0) {
            throw new BusinessException(401, "auth.refresh_invalid");
        }
        try {
            return new Resolved(PartyType.valueOf(value.substring(0, sep)),
                    UUID.fromString(value.substring(sep + 1)));
        } catch (IllegalArgumentException e) {
            throw new BusinessException(401, "auth.refresh_invalid");
        }
    }
}
