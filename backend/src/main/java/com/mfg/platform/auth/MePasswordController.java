package com.mfg.platform.auth;

import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * 已登录改密码：先发邮件验证码，再凭码设新密码（需求方 2026-11-23：不要求输入当前密码）。
 *
 * <p>三端各一条路径，理由同 {@link MeProfileController}：路径前缀即受众，闸门按前缀判身份。
 * 请求体里没有身份字段，用户 id 和邮箱只从 principal 取（§3 铁律 3）。
 */
@RestController
class MePasswordController {

    private final PasswordService service;

    MePasswordController(PasswordService service) {
        this.service = service;
    }

    public record ChangeRequest(@NotBlank @Size(max = 6) String code, @NotBlank String newPassword) {
    }

    public record SendResponse(boolean sent) {
    }

    @PostMapping({"/customer/me/password/code", "/supplier/me/password/code", "/ops/me/password/code"})
    SendResponse sendCode(@CurrentUser UserPrincipal principal,
                          @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage) {
        service.sendChangeCode(principal, acceptLanguage);
        return new SendResponse(true);
    }

    /** 成功后该账号所有设备（含当前）都要重新登录，前端据此清登录态。 */
    @PutMapping({"/customer/me/password", "/supplier/me/password", "/ops/me/password"})
    void change(@CurrentUser UserPrincipal principal, @Valid @RequestBody ChangeRequest request) {
        service.change(principal, request.code(), request.newPassword());
    }
}
