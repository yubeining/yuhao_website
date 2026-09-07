package com.mfg.platform.access;

import com.mfg.common.security.PartyType;
import com.mfg.common.security.RequestPaths;
import com.mfg.common.security.UserPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;

/**
 * ops 端内部的细粒度权限拦截器 —— 跑在 {@code PortalGuardInterceptor} <b>之后</b>。
 *
 * <p>规则来自 {@link RouteAccessRegistry}（唯一维护点，业务 controller 零注解），
 * 授权数据来自 {@code access_grant} 表。
 *
 * <p><b>只管 OPERATOR 端。</b>客户端和供应商端的角色只有 ADMIN|MEMBER，
 * 能不能进那两个端由端级闸门按路径前缀决定，不需要资源级授权表。
 *
 * <h3>方法 → action 的映射</h3>
 * <pre>
 *   GET / HEAD          → READ
 *   POST/PUT/PATCH/DELETE → WRITE
 * </pre>
 * 只有两档，因为再细分（比如 EXPORT、APPROVE）会让授权表爆炸，
 * 而真正需要单独授权的动作已经在路由表里拆成了独立的 resourceKey
 * （{@code ops/quote/approve}、{@code ops/sourcing/dispatch}）—— 那是更好的表达方式。
 *
 * <h3>★ 未注册路径当前放行</h3>
 * <p>见 {@link RouteAccessRegistry} 的类注释：这是为了让模块能增量接入。
 * <b>等所有 ops 端点都登记完，把这里和路由表的默认行为一起改成拒绝。</b>
 */
@Component
public class AccessInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(AccessInterceptor.class);

    /** 端内超级角色。ops 端的 ADMIN 不查授权表。 */
    private static final String ROLE_ADMIN = "ADMIN";

    private static final String ACTION_READ = "READ";
    private static final String ACTION_WRITE = "WRITE";

    private final String apiPrefix;
    private final RouteAccessRegistry registry;
    private final AccessGrantRepository grants;

    public AccessInterceptor(@Value("${app.api.prefix:}") String apiPrefix,
                             RouteAccessRegistry registry,
                             AccessGrantRepository grants) {
        this.apiPrefix = apiPrefix == null ? "" : apiPrefix;
        this.registry = registry;
        this.grants = grants;
    }

    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response,
                             Object handler) throws Exception {

        UserPrincipal principal = currentPrincipal();
        if (principal == null || principal.partyType() != PartyType.OPERATOR) {
            // 非 ops 端 —— 端级闸门已经判过了，这里不重复管辖
            return true;
        }

        if (principal.hasRole(ROLE_ADMIN)) {
            return true;
        }

        // ★ 解码后的路径，和 handler 匹配用的是同一条 —— 原始 URI 里的 %6fps 在路由表里
        //   什么都匹配不上，于是"未注册 = 放行"，细粒度权限就被编码绕过了。
        String path = RequestPaths.decodedPathWithinApi(request, apiPrefix);
        var rule = registry.resolve(path, request.getMethod());
        if (rule.isEmpty()) {
            // 未注册 = 增量接入期间放行。见类注释。
            return true;
        }

        String resourceKey = rule.get().resourceKey();
        String action = isReadOnly(request.getMethod()) ? ACTION_READ : ACTION_WRITE;

        if (grants.hasGrant(principal.id(), resourceKey, action)) {
            return true;
        }

        // ★ 只记资源 key 和动作，不记用户 id / 路径参数（CLAUDE.md §7）
        log.warn("access denied: resourceKey={} action={}", resourceKey, action);
        deny(response);
        return false;
    }

    private static boolean isReadOnly(String method) {
        return "GET".equalsIgnoreCase(method) || "HEAD".equalsIgnoreCase(method);
    }

    private UserPrincipal currentPrincipal() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return null;
        }
        return auth.getPrincipal() instanceof UserPrincipal up ? up : null;
    }

    private void deny(HttpServletResponse response) throws IOException {
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType("application/json;charset=UTF-8");
        // message 是 i18n code 而不是文案（CLAUDE.md §7）
        response.getWriter().write("{\"code\":403,\"message\":\"common.forbidden\",\"data\":null}");
    }
}
