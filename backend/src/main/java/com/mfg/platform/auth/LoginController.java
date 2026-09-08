package com.mfg.platform.auth;

import com.mfg.common.security.PartyType;
import com.mfg.common.security.UserPrincipal;
import com.mfg.common.service.RateLimiter;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import com.mfg.config.AppProperties;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

/**
 * 账号密码登录 —— 三个端共用一个入口，请求里带 {@code portalType} 区分受众。
 *
 * <p>为什么一个入口 + portalType，而不是 /customer/login 等：登录端点是公开的（{@code /auth/**}
 * 无鉴权、不受端级闸门管辖），而同一个邮箱可能在运营和外部两个命名空间各有账号（D23 拆表的
 * 结果），所以必须由调用方明确"我要登哪个端"。前端每个端的登录页本来就知道自己是哪个端。
 *
 * <p>本轮只有密码。供应商也走密码（临时），OTP / 企微扫码是后续。
 */
@RestController
public class LoginController {

    private final AuthService authService;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokens;
    private final RateLimiter rateLimiter;
    private final int maxAttempts;
    private final Duration window;

    public LoginController(AuthService authService, JwtService jwtService,
                           RefreshTokenService refreshTokens, RateLimiter rateLimiter,
                           AppProperties props) {
        this.authService = authService;
        this.jwtService = jwtService;
        this.refreshTokens = refreshTokens;
        this.rateLimiter = rateLimiter;
        this.maxAttempts = props.auth().login().maxAttempts();
        this.window = Duration.ofSeconds(props.auth().login().windowSeconds());
    }

    public record LoginRequest(@NotNull PartyType portalType,
                               @NotBlank String account,
                               @NotBlank String password) {
    }

    public record RefreshRequest(@NotBlank String refreshToken) {
    }

    public record LogoutRequest(@NotBlank String refreshToken) {
    }

    public record TokenResponse(String accessToken, String refreshToken,
                                String portalType, String displayName, String locale) {
    }

    @PostMapping("/auth/login")
    public TokenResponse login(@RequestBody LoginRequest request) {
        // ★ 先限流再验密码：按 (受众+账号) 计数，挡住对单个账号的爆破
        //   （固定窗口 + fail-open，见 RateLimiter；超限抛 429）
        rateLimiter.enforce("login", request.portalType() + ":" + request.account().toLowerCase(),
                maxAttempts, window);

        AuthService.Authenticated auth =
                authService.authenticate(request.portalType(), request.account(), request.password());
        return issue(auth);
    }

    @PostMapping("/auth/refresh")
    public TokenResponse refresh(@RequestBody RefreshRequest request) {
        RefreshTokenService.Rotation rotation = refreshTokens.rotate(request.refreshToken());
        AuthService.Authenticated auth =
                authService.loadPrincipal(rotation.resolved().portal(), rotation.resolved().userId());
        // rotate 已经签好新 refresh，这里只出新的 access
        return new TokenResponse(
                jwtService.issueAccessToken(auth.principal()),
                rotation.newToken(),
                auth.principal().partyType().name(),
                auth.displayName(),
                auth.principal().locale());
    }

    @PostMapping("/auth/logout")
    public void logout(@RequestBody LogoutRequest request) {
        refreshTokens.revoke(request.refreshToken());
    }

    private TokenResponse issue(AuthService.Authenticated auth) {
        UserPrincipal principal = auth.principal();
        String access = jwtService.issueAccessToken(principal);
        String refresh = refreshTokens.issue(principal.partyType(), principal.id());
        return new TokenResponse(access, refresh, principal.partyType().name(),
                auth.displayName(), principal.locale());
    }
}
