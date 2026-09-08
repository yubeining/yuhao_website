package com.mfg.platform.auth;

import com.mfg.common.security.UserPrincipal;
import org.springframework.stereotype.Component;

/**
 * 把 {@link AuthService.Authenticated} 变成 {@link TokenResponse} —— 内外两个登录控制器共用,
 * 避免各写一遍签发逻辑(组合,不用基类)。
 */
@Component
public class AuthTokenIssuer {

    private final JwtService jwtService;
    private final RefreshTokenService refreshTokens;

    public AuthTokenIssuer(JwtService jwtService, RefreshTokenService refreshTokens) {
        this.jwtService = jwtService;
        this.refreshTokens = refreshTokens;
    }

    /** 登录:新签 access + 新签 refresh。 */
    public TokenResponse login(AuthService.Authenticated auth) {
        UserPrincipal p = auth.principal();
        return new TokenResponse(
                jwtService.issueAccessToken(p),
                refreshTokens.issue(p.partyType(), p.id()),
                p.partyType().name(), auth.displayName(), p.locale());
    }

    /** 刷新:新签 access,refresh 用轮换出来的新串。 */
    public TokenResponse refreshed(AuthService.Authenticated auth, String rotatedRefresh) {
        UserPrincipal p = auth.principal();
        return new TokenResponse(
                jwtService.issueAccessToken(p),
                rotatedRefresh,
                p.partyType().name(), auth.displayName(), p.locale());
    }
}
