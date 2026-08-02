package com.mfg.platform.auth;

import com.mfg.common.security.PartyType;
import com.mfg.common.security.UserPrincipal;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * JWT 签发与解析。
 *
 * <h3>★ 关键类型选择：{@code sub} 解析成 {@link UUID}，不是 {@code String}</h3>
 *
 * <p>JWT 的 {@code sub} 本来就是字符串，顺手把 principal id 也存成 String 是最自然的写法 ——
 * 参考系统就是这么干的，代价是出过两次水平越权：{@code String.equals(UUID)}
 * <b>跨类型恒为 false 且没有编译警告</b>，"这条记录是不是你的" 永远判否，
 * 于是走进了本不该走的分支（CLAUDE.md §11 C6）。
 *
 * <p>转换只在这里发生一次（{@code UUID.fromString}），之后全程类型安全。
 * 格式不合法的 token 在这里就被判为无效，而不是带着一个畸形 id 流进业务层。
 *
 * <h3>★ 密钥为空时启动失败，不生成随机值兜底</h3>
 *
 * <p>"没配就随机生成一个" 的写法在多 pod 下每个实例密钥不同，
 * 表现为<b>随机掉线</b>（请求打到 A 签发、B 校验），排查成本极高。
 * 宁可起不来 —— 起不来五分钟就能定位。
 */
@Service
public class JwtService {

    /** HS256 要求密钥至少 256 bit。 */
    private static final int MIN_SECRET_BYTES = 32;

    private static final String CLAIM_PARTY_ID = "pid";
    private static final String CLAIM_PARTY_TYPE = "ptype";
    private static final String CLAIM_EMAIL = "email";
    private static final String CLAIM_LOCALE = "locale";
    private static final String CLAIM_ROLES = "roles";

    private final SecretKey key;
    private final long accessTtlSeconds;
    private final long refreshTtlSeconds;

    public JwtService(@Value("${app.jwt.secret:}") String secret,
                      @Value("${app.jwt.access-token-ttl-seconds:7200}") long accessTtlSeconds,
                      @Value("${app.jwt.refresh-token-ttl-seconds:2592000}") long refreshTtlSeconds) {
        byte[] raw = secret == null ? new byte[0] : secret.getBytes(StandardCharsets.UTF_8);
        if (raw.length < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "app.jwt.secret is missing or too short: need at least " + MIN_SECRET_BYTES
                    + " bytes, got " + raw.length + ". Set the JWT_SECRET environment variable "
                    + "(or put it in application-local.yml, which is gitignored). "
                    + "Never fall back to a generated value: with more than one pod, "
                    + "tokens signed by one instance would be rejected by the others.");
        }
        this.key = Keys.hmacShaKeyFor(raw);
        this.accessTtlSeconds = accessTtlSeconds;
        this.refreshTtlSeconds = refreshTtlSeconds;
    }

    // ---------- 签发 ----------

    public String issueAccessToken(UserPrincipal principal) {
        return issue(principal, accessTtlSeconds);
    }

    public String issueRefreshToken(UserPrincipal principal) {
        return issue(principal, refreshTtlSeconds);
    }

    private String issue(UserPrincipal principal, long ttlSeconds) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(principal.id().toString())
                .claims(Map.of(
                        CLAIM_PARTY_ID, principal.partyId().toString(),
                        CLAIM_PARTY_TYPE, principal.partyType().name(),
                        CLAIM_EMAIL, principal.email() == null ? "" : principal.email(),
                        CLAIM_LOCALE, principal.locale() == null ? "en" : principal.locale(),
                        CLAIM_ROLES, List.copyOf(principal.roles() == null ? Set.of() : principal.roles())))
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(ttlSeconds)))
                .signWith(key)
                .compact();
    }

    // ---------- 解析 ----------

    /**
     * 校验签名与有效期，还原 principal。
     *
     * @return principal；token 无效 / 过期 / 结构不对时返回 {@code null}
     *         （<b>不抛异常</b> —— 无效 token 是预期内的常态，
     *         由 filter 静默跳过，让后续的 Security 规则去决定是 401 还是放行）
     */
    public UserPrincipal parse(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            PartyType partyType = PartyType.valueOf(claims.get(CLAIM_PARTY_TYPE, String.class));
            String email = claims.get(CLAIM_EMAIL, String.class);

            return new UserPrincipal(
                    UUID.fromString(claims.getSubject()),
                    UUID.fromString(claims.get(CLAIM_PARTY_ID, String.class)),
                    partyType,
                    email == null || email.isEmpty() ? null : email,
                    claims.get(CLAIM_LOCALE, String.class),
                    readRoles(claims));
        } catch (JwtException | IllegalArgumentException | NullPointerException e) {
            // 包含：签名不对 / 过期 / sub 不是合法 UUID / ptype 不是已知枚举
            return null;
        }
    }

    private static Set<String> readRoles(Claims claims) {
        Object raw = claims.get(CLAIM_ROLES);
        if (!(raw instanceof List<?> list)) {
            return Set.of();
        }
        Set<String> roles = new LinkedHashSet<>(list.size());
        for (Object o : list) {
            if (o != null) {
                roles.add(o.toString());
            }
        }
        return roles;
    }
}
