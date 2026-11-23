package com.mfg.platform.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 忘记密码 —— 只给客户 / 供应商（需求方 2026-11-23：运营登录页不加忘记密码）。
 *
 * <p>公开端点（{@code /auth/**} 在 SecurityConfig 里 permitAll）。
 * <b>不加限流</b>是需求方的决定（2026-11-23），不是遗漏；单条码错 5 次作废由 service 管。
 */
@RestController
@RequestMapping("/auth/password")
class PasswordResetController {

    private final PasswordService service;

    PasswordResetController(PasswordService service) {
        this.service = service;
    }

    public record ForgotRequest(@NotBlank @Size(max = 320) String email) {
    }

    public record ResetRequest(@NotBlank @Size(max = 320) String email,
                               @NotBlank @Size(max = 6) String code,
                               @NotBlank String newPassword) {
    }

    /** 只说"收到请求了"：不说明邮箱是否注册、也不回显打码后的地址。 */
    public record ForgotResponse(boolean sent) {
    }

    @PostMapping("/forgot")
    ForgotResponse forgot(@Valid @RequestBody ForgotRequest request,
                          @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage) {
        service.sendResetCode(request.email(), acceptLanguage);
        return new ForgotResponse(true);
    }

    /** 重置成功直接登录（需求方 2026-11-23），返回和登录接口同样的登录态。 */
    @PostMapping("/reset")
    TokenResponse reset(@Valid @RequestBody ResetRequest request) {
        return service.reset(request.email(), request.code(), request.newPassword());
    }
}
