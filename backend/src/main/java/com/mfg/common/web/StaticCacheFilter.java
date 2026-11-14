package com.mfg.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 静态资源的缓存策略。
 *
 * <h3>为什么需要它</h3>
 * <p>Spring Security 的 HeaderWriterFilter 会给<b>所有</b>响应写上
 * {@code Cache-Control: no-cache, no-store, max-age=0, must-revalidate}。
 * 对 API 和 SPA 外壳（index.html）这是对的；但 {@code /assets/**} 下的文件名带内容 hash，
 * 内容永远不变 —— 再让浏览器每次都重新下载 480KB 就是纯浪费。
 *
 * <h3>为什么用 Filter 而不是改 Security 配置</h3>
 * <p>Security 的 header writer 在<b>进入过滤器链之前</b>就写好了头，本过滤器排在它之后，
 * 所以这里 {@code setHeader} 会覆盖掉那个 no-store。这样不必关掉 Security 的默认策略
 * （关掉的话 API 响应就失去 no-store，反而更危险）。
 *
 * <p>顺序 {@code HIGHEST_PRECEDENCE + 1000}：晚于 Security（-100），早于业务。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1000)
public class StaticCacheFilter extends OncePerRequestFilter {

    /** 带 hash 的构建产物：一年 + immutable，浏览器和 CDN 都不用再问。 */
    private static final String IMMUTABLE = "public, max-age=31536000, immutable";

    /** 会被替换的入口文件（index.html 由 SPA 外壳返回）：必须每次校验。 */
    private static final String NO_STORE = "no-cache, no-store, max-age=0, must-revalidate";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String path = request.getRequestURI();

        if (path.startsWith("/assets/")) {
            // 文件名里带内容 hash，内容永不变；换版本时文件名会变
            response.setHeader("Cache-Control", IMMUTABLE);
        } else if (path.startsWith("/api/") || path.startsWith("/actuator/")) {
            // 业务响应可能含个人信息，绝不能进共享缓存
            response.setHeader("Cache-Control", NO_STORE);
        } else if (!hasExtension(path)) {
            // SPA 路由（/customer/orders 之类）：返回的是 index.html，必须每次校验
            response.setHeader("Cache-Control", NO_STORE);
        }
        // 其余带扩展名的静态文件（favicon 等）保持 Security 的默认值

        chain.doFilter(request, response);
    }

    private static boolean hasExtension(String path) {
        int slash = path.lastIndexOf('/');
        return path.indexOf('.', slash) > 0;
    }
}
