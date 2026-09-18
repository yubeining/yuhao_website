package com.mfg.platform.identity;

import com.mfg.platform.identity.dto.SupplierInviteCheckView;
import com.mfg.platform.identity.dto.UserView;
import com.mfg.platform.ratelimit.RateLimit;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 公开：凭邀请链接查看、注册供应商账号。挂在 {@code /auth/**} 下（无需登录，同客户自助注册）。
 * 链接本身就是凭据，所以按来源 IP 限流：注册和客户自助注册共用一个计数，查看单独计数。
 */
@RestController
@RequestMapping("/auth/supplier-invites")
public class SupplierInviteController {

    private final SupplierInviteService service;

    public SupplierInviteController(SupplierInviteService service) {
        this.service = service;
    }

    /** 邮箱不收：就是邀请上的那个。密码规则同客户注册。 */
    public record InviteRegisterRequest(@NotBlank @Size(max = 200) String orgName,
                                        @NotBlank @Size(max = 100) String displayName,
                                        @NotBlank @Size(min = 8, max = 100) String password) {
    }

    @RateLimit(scope = "invite-check", limit = "60", windowSeconds = "3600")
    @GetMapping("/{token}")
    public SupplierInviteCheckView check(@PathVariable String token) {
        return service.check(token);
    }

    @RateLimit(scope = "register", limit = "20", windowSeconds = "3600")
    @PostMapping("/{token}/register")
    public UserView register(@PathVariable String token, @Valid @RequestBody InviteRegisterRequest request) {
        return UserView.of(service.register(token, request.orgName(), request.displayName(), request.password()));
    }
}
