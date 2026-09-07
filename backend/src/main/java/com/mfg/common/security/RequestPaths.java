package com.mfg.common.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.server.PathContainer;
import org.springframework.http.server.RequestPath;
import org.springframework.web.util.ServletRequestPathUtils;

/**
 * 从请求里取【解码后】的应用内路径，供两个拦截器共用。
 *
 * <h3>★ 绝不能拿 {@code request.getRequestURI()} 做路径判断</h3>
 *
 * <p>它是原始、未解码的 URI。{@code /api/v1/%6fps/whoami} 的第一段在它眼里是
 * {@code %6fps} 而不是 {@code ops}；而 Spring MVC 是按<b>解码后</b>的路径匹配 controller 的。
 * 拦截器和 handler 看到的不是同一条路径，请求就从闸门旁边走过去了 ——
 * 2026-09-07 实测：CUSTOMER 的 token 打 {@code /%6fps/whoami} 返回 200，
 * 进了 ops 端的 handler（见 {@code changelog/2026-09-07_portal-guard-encoded-path/}）。
 *
 * <p>这里用的是 DispatcherServlet 已经解析好的 {@link RequestPath}，每一段取
 * {@link PathContainer.PathSegment#valueToMatch()} —— 就是 handler 映射时用的那个值。
 * 两边看同一条路径，"路径前缀即受众" 这句话才成立。
 */
public final class RequestPaths {

    private RequestPaths() {
    }

    /**
     * 解码后的应用内路径，已剥去 API 前缀，以 {@code /} 开头，例如 {@code /ops/whoami}。
     * 不在 API 前缀之下的请求原样返回（同样是解码后的）。
     *
     * @param apiPrefix 全局 API 前缀，可为空串
     */
    public static String decodedPathWithinApi(HttpServletRequest request, String apiPrefix) {
        RequestPath parsed = ServletRequestPathUtils.hasParsedRequestPath(request)
                ? ServletRequestPathUtils.getParsedRequestPath(request)
                : ServletRequestPathUtils.parseAndCache(request);
        String decoded = decode(parsed.pathWithinApplication());
        if (apiPrefix != null && !apiPrefix.isEmpty() && decoded.startsWith(apiPrefix)) {
            String rest = decoded.substring(apiPrefix.length());
            // 前缀必须落在段边界上：/api/v1x/... 不算 /api/v1 之下
            if (rest.isEmpty()) {
                return "/";
            }
            if (rest.startsWith("/")) {
                return rest;
            }
        }
        return decoded;
    }

    /** 第一段路径（不含斜杠）；根路径返回 {@code null}。 */
    public static String firstSegment(String path) {
        int start = 0;
        while (start < path.length() && path.charAt(start) == '/') {
            start++;
        }
        if (start >= path.length()) {
            return null;
        }
        int end = path.indexOf('/', start);
        return end < 0 ? path.substring(start) : path.substring(start, end);
    }

    private static String decode(PathContainer container) {
        StringBuilder sb = new StringBuilder(container.value().length());
        for (PathContainer.Element e : container.elements()) {
            if (e instanceof PathContainer.PathSegment seg) {
                sb.append(seg.valueToMatch());
            } else {
                sb.append(e.value());
            }
        }
        return sb.toString();
    }
}
