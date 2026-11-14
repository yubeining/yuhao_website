package com.mfg.platform.auth;

import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

/**
 * 个人资料：读自己的账号信息、改自己的昵称。
 *
 * <h3>为什么三个端各一条路径</h3>
 * <p>路径前缀即受众，{@code PortalGuardInterceptor} 按前缀判身份。写成一个通用的
 * {@code /me/profile} 就成了三端公共入口，闸门管不到它 —— 和 whoami、me/locale 同一条约定。
 *
 * <h3>为什么请求体里没有身份字段</h3>
 * <p>用户 id 只从 principal 取（§3 铁律 3）。收了 {@code userId} 就多一个越权入口。
 *
 * <h3>为什么只有昵称可改</h3>
 * <p>邮箱是登录标识，换绑要先证明新旧两个邮箱都归本人，是另一条流程；
 * 身份由组织类型推出；注册时间不可变。这三项前端置灰展示。
 */
@RestController
class MeProfileController {

    /** 与运营后台改用户名的上限一致。 */
    private static final int MAX_NICKNAME = 100;

    private final AuthService auth;

    MeProfileController(AuthService auth) {
        this.auth = auth;
    }

    /**
     * @param partyType 由 principal 补，不落库
     */
    record ProfileResponse(String email, String nickname, String partyType, Instant createdAt) {
    }

    record NicknameRequest(@NotBlank @Size(max = MAX_NICKNAME) String nickname) {
    }

    @GetMapping({"/customer/me/profile", "/supplier/me/profile", "/ops/me/profile"})
    ProfileResponse get(@CurrentUser UserPrincipal principal) {
        AuthService.Profile profile = auth.findProfile(principal.id())
                .orElseThrow(() -> new BusinessException(404, "common.not_found"));
        return new ProfileResponse(
                profile.email(), profile.nickname(), principal.partyType().name(), profile.createdAt());
    }

    @PatchMapping({"/customer/me/profile", "/supplier/me/profile", "/ops/me/profile"})
    void updateNickname(@CurrentUser UserPrincipal principal,
                        @Valid @RequestBody NicknameRequest request) {
        String nickname = request.nickname().trim();
        if (nickname.isEmpty()) {
            // @NotBlank 已挡掉全空白，这里是 trim 后为空的兜底（例如全角空格）
            throw new BusinessException(400, "common.validation_failed");
        }
        auth.updateNickname(principal.id(), nickname);
    }
}
