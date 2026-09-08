package com.mfg.platform.auth;

import com.mfg.common.cache.CacheKeys;
import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.PartyType;
import com.mfg.common.service.RedisService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Refresh token —— 不透明随机串,存 Redis,可轮换、可撤销。
 *
 * <p>access token 是无状态 JWT(短命,签出去撤不掉,靠短命兜);refresh 活 30 天必须能撤销,
 * 所以存 Redis:key 在即有效,删掉即失效。轮换 = 每次刷新换新的、旧的立即作废。
 * 值里只存 {@code 受众:userId},刷新时据此重新从库加载 principal(反映当前状态,不把角色带 30 天)。
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

    public String issue(PartyType portal, UUID userId) {
        String token = UUID.randomUUID().toString().replace("-", "");
        redis.set(CacheKeys.refreshToken(token), portal.name() + ":" + userId, ttlSeconds);
        return token;
    }

    public record Resolved(PartyType portal, UUID userId) {
    }

    public record Rotation(Resolved resolved, String newToken) {
    }

    /**
     * 消费旧 token(校验 + 删除)并签发新 token。
     *
     * @throws BusinessException 401 {@code auth.refresh_invalid}
     */
    public Rotation rotate(String oldToken) {
        Resolved resolved = consume(oldToken);
        return new Rotation(resolved, issue(resolved.portal(), resolved.userId()));
    }

    /** 撤销(登出),幂等。 */
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
        redis.delete(CacheKeys.refreshToken(token));   // 一次性 + 轮换
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
