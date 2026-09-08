package com.mfg.common.security;

import org.springframework.core.MethodParameter;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * 解析 {@link CurrentUser} 参数。
 *
 * <p>没有 principal 时注入 {@code null} 而不是抛异常 —— 公开端点也可能
 * 顺手标个 {@code @CurrentUser}（登录了就记录操作人，没登录就匿名）。
 * 需要强制登录的端点由 Security 规则拦在前面，轮不到这里判。
 */
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(CurrentUser.class)
                && UserPrincipal.class.isAssignableFrom(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter,
                                  ModelAndViewContainer mavContainer,
                                  NativeWebRequest webRequest,
                                  WebDataBinderFactory binderFactory) {
        return AuthContext.currentPrincipal();
    }
}
