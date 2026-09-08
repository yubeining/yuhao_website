package com.mfg.common.web;

import com.mfg.common.dto.PageQuery;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.MethodParameter;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * 把 {@code ?page=&pageSize=} 解析成 {@link PageQuery} —— <b>全局统一的分页入参</b>,
 * 所有 controller 一视同仁,不分内外/受众(内外之分是路径层/端级闸门的事,不进分页)。
 *
 * <p>缺参用默认 size;非法数字回落默认;size 超全局上限截到上限(不报错,避免翻页参数打断请求)。
 * page 下限由 {@link PageQuery} 构造器兜(≥1)。
 */
public class PageQueryArgumentResolver implements HandlerMethodArgumentResolver {

    private final int defaultSize;
    private final int maxSize;

    public PageQueryArgumentResolver(int defaultSize, int maxSize) {
        this.defaultSize = defaultSize;
        this.maxSize = maxSize;
    }

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.getParameterType() == PageQuery.class;
    }

    @Override
    public Object resolveArgument(MethodParameter parameter,
                                  ModelAndViewContainer mavContainer,
                                  NativeWebRequest webRequest,
                                  WebDataBinderFactory binderFactory) {
        HttpServletRequest request = webRequest.getNativeRequest(HttpServletRequest.class);
        int page = parseOr(request == null ? null : request.getParameter("page"), 1);
        int size = parseOr(request == null ? null : request.getParameter("pageSize"), defaultSize);
        if (size > maxSize) {
            size = maxSize;
        }
        return new PageQuery(page, size);   // 构造器兜 page≥1 / size≥1
    }

    private static int parseOr(String raw, int fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            return Integer.parseInt(raw.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
