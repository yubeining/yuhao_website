package com.mfg.platform.auth;

import com.mfg.common.security.CurrentParty;
import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 修改「自己」的语言偏好。
 *
 * <h3>为什么每个端各一份</h3>
 * <p>和 {@link WhoAmIController} 同理：路径前缀即受众。写成一个通用的
 * {@code /me/locale} 就成了三端公共入口，端级闸门管不到它。
 *
 * <h3>为什么不收 userId</h3>
 * <p>只能改自己的。用户 id 从 principal 取（{@link CurrentUser}），
 * 请求体里<b>没有</b>身份字段 —— 收了就多一个越权入口（CLAUDE.md §3 铁律 3）。
 *
 * <h3>为什么要校验取值</h3>
 * <p>不校验的话，任何字符串都会被写进 `external_user.locale`，
 * 而前端拿它去查文案表会直接查空 —— 表现为"整个界面变成 key"。
 * 支持的语言由 {@code app.i18n.supported-locales} 决定，加语言时改配置。
 */
@RestController
class MeLocaleController {

    private final AuthService auth;
    private final Set<String> supported;

    MeLocaleController(AuthService auth,
                       @Value("${app.i18n.supported-locales:zh,en}") String supportedLocales) {
        this.auth = auth;
        this.supported = Arrays.stream(supportedLocales.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(s -> s.toLowerCase(Locale.ROOT))
                .collect(Collectors.toUnmodifiableSet());
    }

    public record LocaleRequest(@NotBlank @Size(max = 16) String locale) {
    }

    @PatchMapping({"/customer/me/locale", "/supplier/me/locale", "/ops/me/locale"})
    void update(@CurrentUser UserPrincipal principal, @Valid @RequestBody LocaleRequest request) {
        String normalized = request.locale().trim().toLowerCase(Locale.ROOT);
        if (!supported.contains(normalized)) {
            // 不支持的语言明确拒绝，不要"存下来然后前端查空"
            throw new com.mfg.common.exception.BusinessException(400, "common.locale_unsupported");
        }
        auth.updateLocale(principal.id(), normalized);
    }
}
