package com.mfg.platform.auth;

import com.mfg.platform.ratelimit.RateLimit;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 验证码登录 —— 公开端点（{@code /auth/**} 在 SecurityConfig 里 permitAll）。
 *
 * <p>两个接口刻意分开：发码和校验是两种不同性质的动作，各自的限流阈值不该混在一起。
 * 同一个 IP 一天发 20 次码是滥用，校验 60 次则很正常（用户会打错）。
 *
 * <p>受众（客户 / 供应商）<b>不由调用方声明</b>，仍由账号所属组织的 type 推出，
 * 和密码登录完全一致。
 */
@RestController
@RequestMapping("/auth/otp")
class AuthOtpController {

    private final OtpService service;

    AuthOtpController(OtpService service) {
        this.service = service;
    }

    public record SendRequest(@NotNull OtpChannel channel,
                              @NotBlank @Size(max = 320) String identifier) {
    }

    public record VerifyRequest(@NotNull OtpChannel channel,
                                @NotBlank @Size(max = 320) String identifier,
                                @NotBlank @Size(max = 6) String code) {
    }

    /**
     * 发码的响应里<b>只有"收到请求了"</b>，不说明这个标识是否存在、也不回显打码后的地址 ——
     * 回显本身就是一种信息泄露（能把"没发出去"和"发给了 x***@y.com"区分开）。
     */
    public record SendResponse(boolean sent) {
    }

    /**
     * 校验结果。
     *
     * <p>{@code registrationRequired=true} 表示「邮箱已验证，但还没有账号」——
     * 此时<b>不签发登录态</b>。这一步只有真正收到邮件的人走得到，所以不构成账号枚举。
     * 补公司信息、建号那一步还没做，前端拿到这个标志应该引导去注册页，而不是当登录成功。
     */
    public record VerifyResponse(boolean registrationRequired, TokenResponse token) {
    }

    /** 第二层限流：同一 IP 每小时 20 次发码（第一层"同标识 5 次/小时"在 service 里）。 */
    @RateLimit(scope = "otp-send-ip", limit = "${app.auth.otp.ip-limit:20}", windowSeconds = "3600")
    @PostMapping("/send")
    SendResponse send(@Valid @RequestBody SendRequest request) {
        service.send(request.channel(), request.identifier());
        return new SendResponse(true);
    }

    /** 校验单独限流：同一 IP 每小时 60 次。单条码的错 5 次作废由 service 管。 */
    @RateLimit(scope = "otp-verify-ip", limit = "${app.auth.otp.verify-ip-limit:60}", windowSeconds = "3600")
    @PostMapping("/verify")
    VerifyResponse verify(@Valid @RequestBody VerifyRequest request) {
        OtpService.VerifyOutcome outcome =
                service.verify(request.channel(), request.identifier(), request.code());
        return new VerifyResponse(outcome.registrationRequired(), outcome.token());
    }
}
