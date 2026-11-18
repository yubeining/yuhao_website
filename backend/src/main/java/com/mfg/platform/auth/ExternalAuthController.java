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
import jakarta.validation.constraints.Size;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
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
    private final OtpService otpService;
    private final boolean passwordRegisterEnabled;

    public ExternalAuthController(IdentityService identityService, AuthService authService,
                                  RefreshTokenService refreshTokens, AuthTokenIssuer tokenIssuer,
                                  OtpService otpService,
                                  @Value("${app.auth.password-register-enabled:false}")
                                  boolean passwordRegisterEnabled) {
        this.passwordRegisterEnabled = passwordRegisterEnabled;
        this.identityService = identityService;
        this.authService = authService;
        this.refreshTokens = refreshTokens;
        this.tokenIssuer = tokenIssuer;
        this.otpService = otpService;
    }

    public record ExternalLoginRequest(@NotBlank String account, @NotBlank String password) {
    }

    /**
     * 「邮箱 + 密码」自助注册。<b>默认关闭</b>（{@code app.auth.password-register-enabled}），关着时是 404。
     *
     * <p>★ 这条路不验证邮箱归属：任何人都能用别人的邮箱 + 自己的密码抢先建号，对方以后用验证码登录进的就是这个号，
     * 抢注的人一直能用密码进去看图纸和订单（2026-11-18 review）。注册的唯一入口是下面的验证码注册；
     * 保留这个方法只因为集成测试靠它建账号（test profile 里打开）。
     */
    @RateLimit(scope = "register", limit = "20", windowSeconds = "3600")
    @PostMapping("/register")
    public UserView register(@Valid @RequestBody RegisterRequest request) {
        if (!passwordRegisterEnabled) {
            throw BusinessException.notFound("auth.password_register_disabled");
        }
        ExternalUser created = identityService.register(request);
        return UserView.of(created);
    }

    public record RegisterByCodeRequest(
            @NotBlank @Size(max = 320) String email,
            @NotBlank @Size(max = 6) String code,
            /* 公司名：注册时收，因为它是账号主体（报价/合同抬头）。老客户端不传也能注册，之后在设置里补。 */
            @Size(max = 200) String orgName) {
    }

    /**
     * 邮箱验证码注册 —— 客户自助注册的唯一入口(2026-11-14)。
     *
     * <p>流程：先 {@code POST /auth/otp/send} 发码，再拿邮箱 + 码调这里。
     * 码在这里校验并消费，通过后建组织 + 用户并<b>直接签发登录态</b>，
     * 用户不用再去登录页走一遍。
     *
     * <p>建出来的账号没有密码，只能用验证码登录 —— 这正是"注册只要邮箱"的代价，
     * 需求方已知情（2026-11-14）。
     */
    @RateLimit(scope = "register-otp", limit = "20", windowSeconds = "3600")
    @PostMapping("/register/otp")
    public TokenResponse registerWithCode(@Valid @RequestBody RegisterByCodeRequest request) {
        String email = otpService.verifyRegistration(OtpChannel.EMAIL, request.email(), request.code());
        identityService.registerVerifiedEmail(email, request.orgName());
        AuthService.Authenticated account = authService.findExternalByEmail(email)
                .orElseThrow(() -> new BusinessException(500, "common.internal_error"));
        authService.markEmailVerified(account.principal().id(), Instant.now());
        return tokenIssuer.login(account);
    }

    /**
     * 外部登录:只凭账号+密码,受众由账号所属组织推出(运营账号不在此表,自然登不进)。按账号限流。
     *
     * <p>★ 限流 key 必须和 {@code AuthService.normalize()} 用<b>同一套规整</b>(trim + toLowerCase)。
     * 两边不一致 = 限流白做:少一个 trim,攻击者在邮箱前加一个空格就换到另一个计数桶,
     * 而登录查用户时 trim 掉了,打的还是同一个账号 —— 每加一个空格就白送一整轮尝试次数。
     * 改这里的时候连 {@code normalize()} 一起改,别只改一边。
     */
    @RateLimit(scope = "login", key = "#request.account.trim().toLowerCase()",
            limit = "${app.auth.login.max-attempts}", windowSeconds = "${app.auth.login.window-seconds}")
    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody ExternalLoginRequest request) {
        return tokenIssuer.login(authService.authenticateExternal(request.account(), request.password()));
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
