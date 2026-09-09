package com.mfg.platform.auth;

import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.PartyType;
import com.mfg.platform.ratelimit.RateLimit;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 内部(运营)认证 —— <b>独立 URL {@code /auth/internal}</b>,和外部认证({@link ExternalAuthController})
 * 完全分开,页面不混。运营账号由内部开通,<b>没有自助注册</b>。
 *
 * <p>恒为 OPERATOR,故登录请求不带 portalType。{@code /auth/**} 公开,登录限流防爆破。
 */
@RestController
@RequestMapping("/auth/internal")
public class OpsAuthController {

    private final AuthService authService;
    private final RefreshTokenService refreshTokens;
    private final AuthTokenIssuer tokenIssuer;

    public OpsAuthController(AuthService authService, RefreshTokenService refreshTokens,
                             AuthTokenIssuer tokenIssuer) {
        this.authService = authService;
        this.refreshTokens = refreshTokens;
        this.tokenIssuer = tokenIssuer;
    }

    public record OpsLoginRequest(@NotBlank String account, @NotBlank String password) {
    }

    /** 运营登录。按账号限流(和外部同一套阈值,不同 scope)。 */
    @RateLimit(scope = "login-ops", key = "#request.account.trim().toLowerCase()",
            limit = "${app.auth.login.max-attempts}", windowSeconds = "${app.auth.login.window-seconds}")
    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody OpsLoginRequest request) {
        return tokenIssuer.login(authService.authenticateOps(request.account(), request.password()));
    }

    @PostMapping("/refresh")
    public TokenResponse refresh(@Valid @RequestBody RefreshRequest request) {
        RefreshTokenService.Rotation rotation = refreshTokens.rotate(request.refreshToken());
        if (rotation.resolved().portal() != PartyType.OPERATOR) {
            // 外部的 refresh 不许在内部入口刷
            throw new BusinessException(401, "auth.refresh_invalid");
        }
        return tokenIssuer.refreshed(
                authService.loadPrincipal(PartyType.OPERATOR, rotation.resolved().userId()),
                rotation.newToken());
    }

    @PostMapping("/logout")
    public void logout(@Valid @RequestBody LogoutRequest request) {
        refreshTokens.revoke(request.refreshToken());
    }
}
