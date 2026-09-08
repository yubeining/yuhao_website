package com.mfg.platform.auth;

import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.PartyType;
import com.mfg.platform.identity.ExternalUser;
import com.mfg.platform.identity.IdentityService;
import com.mfg.platform.identity.dto.RegisterRequest;
import com.mfg.platform.identity.dto.UserView;
import com.mfg.platform.ratelimit.RateLimit;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 外部(客户 / 供应商)认证 —— 注册 + 登录 + 刷新 + 登出。
 *
 * <p><b>和内部运营的认证是两条独立 URL</b>({@link OpsAuthController} 在 {@code /auth/internal}),
 * 页面互不相干:外部登录页不该出现在内部后台,反之亦然,跨受众也无法互相探测账号是否存在。
 *
 * <p>{@code /auth/**} 是公开的(不过端级闸门、无需 JWT)。登录 / 注册都限流(防爆破 / 防刷号)。
 */
@RestController
@RequestMapping("/auth")
public class ExternalAuthController {

    private final IdentityService identityService;
    private final AuthService authService;
    private final RefreshTokenService refreshTokens;
    private final AuthTokenIssuer tokenIssuer;

    public ExternalAuthController(IdentityService identityService, AuthService authService,
                                  RefreshTokenService refreshTokens, AuthTokenIssuer tokenIssuer) {
        this.identityService = identityService;
        this.authService = authService;
        this.refreshTokens = refreshTokens;
        this.tokenIssuer = tokenIssuer;
    }

    public record ExternalLoginRequest(@NotNull PartyType portalType,
                                        @NotBlank String account,
                                        @NotBlank String password) {
    }

    /** 自助注册:建组织 + 首个用户。按来源 IP 限流(防批量刷号)。 */
    @RateLimit(scope = "register", limit = "20", windowSeconds = "3600")
    @PostMapping("/register")
    public UserView register(@Valid @RequestBody RegisterRequest request) {
        ExternalUser created = identityService.register(request);
        return UserView.of(created);
    }

    /** 外部登录。仅 CUSTOMER / SUPPLIER;按 (端+账号) 限流。 */
    @RateLimit(scope = "login", key = "#request.portalType + ':' + #request.account.toLowerCase()",
            limit = "${app.auth.login.max-attempts}", windowSeconds = "${app.auth.login.window-seconds}")
    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody ExternalLoginRequest request) {
        if (request.portalType() == PartyType.OPERATOR) {
            // 运营请走 /auth/internal/login,不在外部入口
            throw new BusinessException(400, "auth.portal_invalid");
        }
        return tokenIssuer.login(
                authService.authenticateExternal(request.portalType(), request.account(), request.password()));
    }

    @PostMapping("/refresh")
    public TokenResponse refresh(@Valid @RequestBody RefreshRequest request) {
        RefreshTokenService.Rotation rotation = refreshTokens.rotate(request.refreshToken());
        if (rotation.resolved().portal() == PartyType.OPERATOR) {
            // 运营的 refresh 只能在内部入口刷,别在外部混用
            throw new BusinessException(401, "auth.refresh_invalid");
        }
        return tokenIssuer.refreshed(
                authService.loadPrincipal(rotation.resolved().portal(), rotation.resolved().userId()),
                rotation.newToken());
    }

    @PostMapping("/logout")
    public void logout(@Valid @RequestBody LogoutRequest request) {
        refreshTokens.revoke(request.refreshToken());
    }
}
