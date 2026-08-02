package com.mfg.common.security;

import org.springframework.core.MethodParameter;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.util.UUID;

/**
 * 解析 {@link CurrentParty} 参数为 {@code UUID}。
 *
 * <p><b>★ 和 {@link CurrentUserArgumentResolver} 不同，这里没有 principal 就抛异常。</b>
 *
 * <p>{@code partyId} 是所有租户隔离查询的入参（CLAUDE.md §5 铁律 1/2）。
 * 一旦它是 {@code null}，{@code findByIdAndPartyId(id, null)} 会静默返回空 ——
 * 表现为「数据不见了」，而不是「你没登录」，排查方向从一开始就是错的。
 * 更糟的情况是某个 service 把 null 当成「不限制」处理，那就是越权。
 *
 * <p>宁可这里直接炸：能标 {@code @CurrentParty} 的端点，本来就必须先登录。
 */
public class CurrentPartyArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(CurrentParty.class)
                && UUID.class.isAssignableFrom(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter,
                                  ModelAndViewContainer mavContainer,
                                  NativeWebRequest webRequest,
                                  WebDataBinderFactory binderFactory) {
        UserPrincipal principal = CurrentUserArgumentResolver.currentPrincipal();
        if (principal == null || principal.partyId() == null) {
            throw new IllegalStateException(
                    "@CurrentParty requires an authenticated principal, but none was present on "
                    + parameter.getMethod()
                    + ". Either the endpoint is missing an authentication rule in SecurityConfig, "
                    + "or it is a public endpoint that should derive its scope from the resource "
                    + "instead (CLAUDE.md section 5, rule 5).");
        }
        return principal.partyId();
    }
}
