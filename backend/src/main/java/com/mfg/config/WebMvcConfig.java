package com.mfg.config;

import com.mfg.common.security.CurrentPartyArgumentResolver;
import com.mfg.common.security.CurrentUserArgumentResolver;
import com.mfg.common.security.PortalGuardInterceptor;
import com.mfg.platform.observability.MdcUserContextInterceptor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.HandlerTypePredicate;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.PathMatchConfigurer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

/**
 * MVC 装配：API 前缀、拦截器链、参数解析器。
 *
 * <h3>★ 全局 API 前缀在这里生效，不是 Tomcat context-path</h3>
 *
 * <p>用 context-path 的话，{@code /actuator} 和静态资源也会被套上前缀，
 * 而且 Spring Security 的 matcher 拿到的路径是<b>剥掉 context-path 之后</b>的，
 * 两边路径不一致，配安全规则时极易配错（CLAUDE.md §2 / §11 C5）。
 *
 * <p>前缀<b>只加给 {@code @RestController}</b>。这样 {@link SpaForwardController}
 * （{@code @Controller}，负责把前端路由 forward 到 index.html）不会被套前缀 ——
 * 否则 {@code /customer/**} 会变成 {@code /api/v1/customer/**}，SPA 直接白屏。
 *
 * <h3>★ 端级硬闸门</h3>
 * <p>{@link PortalGuardInterceptor} —— 按路径前缀拒绝错误的 principal type。
 * 跨端泄露是本系统头号风险，先把人挡在门外。
 * （ops 端内部细粒度权限的 access 子系统已随账号体系一并移除，待重建。）
 *
 * <p><b>两个拦截器都只挂在 API 前缀下</b>（{@code apiPrefix + "/**"}）。
 * 这一点在「前后端同一个部署单元」的形态下是必需的 —— 否则浏览器请求
 * SPA 页面路径 {@code /customer/rfqs}（要的是 index.html，不是 JSON）
 * 也会被端级闸门当成 API 调用拒掉。
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final String apiPrefix;
    private final PortalGuardInterceptor portalGuardInterceptor;
    private final MdcUserContextInterceptor mdcUserContextInterceptor;

    public WebMvcConfig(@Value("${app.api.prefix:}") String apiPrefix,
                        PortalGuardInterceptor portalGuardInterceptor,
                        MdcUserContextInterceptor mdcUserContextInterceptor) {
        this.apiPrefix = apiPrefix == null ? "" : apiPrefix;
        this.portalGuardInterceptor = portalGuardInterceptor;
        this.mdcUserContextInterceptor = mdcUserContextInterceptor;
    }

    @Override
    public void configurePathMatch(PathMatchConfigurer configurer) {
        if (!apiPrefix.isEmpty()) {
            configurer.addPathPrefix(apiPrefix, HandlerTypePredicate.forAnnotation(RestController.class));
        }
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        String pattern = apiPrefix + "/**";
        // order(0)：认证之后最先跑，把 userId/portal 补进 MDC，后面闸门的日志也带上
        registry.addInterceptor(mdcUserContextInterceptor).addPathPatterns(pattern).order(0);
        registry.addInterceptor(portalGuardInterceptor).addPathPatterns(pattern).order(1);
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(new CurrentUserArgumentResolver());
        resolvers.add(new CurrentPartyArgumentResolver());
    }
}
