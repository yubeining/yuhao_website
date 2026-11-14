package com.mfg.platform.auth;

import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 修改「自己」的称呼（显示名）。
 *
 * <h3>为什么每个端各一份</h3>
 * <p>和 {@link MeLocaleController} 同理：路径前缀即受众，端级闸门按前缀判身份。
 * 写成一个通用的 {@code /me/name} 就成了三端公共入口，闸门管不到它。
 *
 * <h3>为什么不收 userId</h3>
 * <p>只能改自己的。id 从 principal 取，请求体里没有身份字段（CLAUDE.md §3 铁律 3）。
 *
 * <h3>为什么需要这个入口</h3>
 * <p>注册只要邮箱，显示名默认取邮箱前缀 —— 数字邮箱（如 QQ 号）会得到一个纯数字的
 * 称呼，出现在顶栏和「你好，X」里。用户可以在这里改成真名或希望被称呼的名字。
 */
@RestController
class MeNameController {

    /** 与运营后台改用户名的上限保持一致。 */
    private static final int MAX_LENGTH = 100;

    private final AuthService auth;

    MeNameController(AuthService auth) {
        this.auth = auth;
    }

    public record NameRequest(@NotBlank @Size(max = MAX_LENGTH) String displayName) {
    }

    @PatchMapping({"/customer/me/name", "/supplier/me/name", "/ops/me/name"})
    void update(@CurrentUser UserPrincipal principal, @Valid @RequestBody NameRequest request) {
        String name = request.displayName().trim();
        if (name.isEmpty()) {
            // @NotBlank 已经挡掉全空白，这里是 trim 之后仍为空的兜底（例如全角空格）
            throw new BusinessException(400, "common.validation_failed");
        }
        auth.updateDisplayName(principal.id(), name);
    }
}
