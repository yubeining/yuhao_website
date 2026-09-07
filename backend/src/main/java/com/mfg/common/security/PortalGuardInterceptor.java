package com.mfg.common.security;

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

/**
 * ★ 端级硬闸门 —— 本系统第一道、也是最重要的一道拦截器。
 *
 * <p>规则简单到不可能写错：<b>URL 路径前缀即受众</b>。
 * <pre>
 *   /customer/**   仅 CUSTOMER
 *   /supplier/**   仅 SUPPLIER
 *   /ops/**        仅 OPERATOR
 *   其余（public / auth / health）不受本闸门管辖
 * </pre>
 *
 * <p><b>为什么用这么粗的粒度</b>
 *
 * <p>本系统头号风险不是"某个用户越权改了自己不该改的字段"，而是
 * <b>跨端信息泄露</b> —— 客户身份泄给供应商、对客价泄给供应商、供应商身份泄给客户。
 * 这类泄露一旦发生就是不可逆的商业损失（对方绕过平台直接交易）。
 *
 * <p>细粒度权限模型（每个端点一个资源 key）表达能力强，但也意味着
 * <b>每个新端点都可能配错</b>，而配错的后果是静默的 —— 不会报错，只是多返了几个字段。
 * 路径前缀不一样：它是结构性的，新端点放在哪个目录下就自动继承哪个受众，
 * 想配错都难，而且 code review 时看一眼 URL 就知道。
 *
 * <p>细粒度权限只在 OPERATOR 端<b>内部</b>需要（销售不该改质检结论），
 * 由 {@code RouteAccessRegistry} + {@code AccessInterceptor} 处理，跑在本拦截器之后。
 *
 * <p><b>注意</b>：这道闸门管的是"能不能进这个端"，不管"这条数据是不是你的"。
 * 后者是 repository 层的 {@code findByIdAndPartyId} 的责任 —— 两者都要有，
 * 见 CLAUDE.md §5 六条铁律。
 */
@Component
public class PortalGuardInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(PortalGuardInterceptor.class);

    /** 不受端级闸门管辖的路径段。 */
    private static final java.util.Set<String> UNGUARDED =
            java.util.Set.of("public", "auth", "health", "actuator");

    private final String apiPrefix;

    /**
     * @param apiPrefix 全局 API 前缀，从配置读 —— 代码里绝不硬编码 "/api/v1"
     *                  （CLAUDE.md §11 C5）。测试 profile 里是空串。
     */
    public PortalGuardInterceptor(@Value("${app.api.prefix:}") String apiPrefix) {
        this.apiPrefix = apiPrefix == null ? "" : apiPrefix;
    }

    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response,
                             Object handler) throws Exception {

        // ★ 用解码后的路径，不用 request.getRequestURI()：后者是原始 URI，
        //   /%6fps/... 在它眼里不是 ops，而 handler 匹配用的是解码后的 /ops/...
        //   —— 两边看不同的路径，闸门就形同虚设。见 RequestPaths 的类注释。
        String segment = RequestPaths.firstSegment(RequestPaths.decodedPathWithinApi(request, apiPrefix));
        if (segment == null || UNGUARDED.contains(segment)) {
            return true;
        }

        PartyType required = PartyType.fromPathSegment(segment);
        if (required == null) {
            // 不是三个受众路径之一 —— 放行，由后续的 Security 配置处理
            return true;
        }

        UserPrincipal principal = currentPrincipal();
        if (principal == null) {
            // 未认证。JwtAuthFilter 已经跑过了，到这里还没有 principal 说明没带/带错 token
            deny(response, HttpStatus.UNAUTHORIZED, "common.unauthenticated");
            return false;
        }

        if (principal.partyType() != required) {
            // ★ 只记类型不记身份 —— 日志里不放用户 id / 邮箱 / 路径参数
            log.warn("portal guard denied: required={} actual={} path={}",
                    required, principal.partyType(), segment);
            deny(response, HttpStatus.FORBIDDEN, "common.wrong_portal");
            return false;
        }

        return true;
    }

    private UserPrincipal currentPrincipal() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return null;
        }
        Object p = auth.getPrincipal();
        return p instanceof UserPrincipal up ? up : null;
    }

    private void deny(HttpServletResponse response, HttpStatus status, String messageCode)
            throws java.io.IOException {
        response.setStatus(status.value());
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(
                "{\"code\":" + status.value() + ",\"message\":\"" + messageCode + "\",\"data\":null}");
    }
}
