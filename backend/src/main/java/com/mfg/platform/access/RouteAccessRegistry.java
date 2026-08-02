package com.mfg.platform.access;

import org.springframework.http.server.PathContainer;
import org.springframework.stereotype.Component;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * OPERATOR 端内部的路由权限表 —— <b>唯一的维护点</b>。
 *
 * <p>把 URL 模式映射到资源 key，{@code AccessInterceptor} 据此鉴权，
 * <b>业务 controller 上零注解</b>。新增端点只需在 {@link #buildRules()} 加一行，
 * 不用碰任何 controller，也不会出现"忘了加 @PreAuthorize"这种漏洞。
 *
 * <p><b>只管 OPERATOR 端。</b>客户端和供应商端的角色只有 ADMIN|MEMBER，
 * 简单到不需要权限表；能不能进那两个端由 {@code PortalGuardInterceptor} 按路径前缀决定。
 *
 * <p><b>多个模式命中时最具体的赢</b>（{@link PathPattern#SPECIFICITY_COMPARATOR}），
 * 所以 {@code /ops/quotes/approvals/**} 会覆盖更宽的 {@code /ops/quotes/**}。
 *
 * <p><b>未注册路径的默认行为：放行</b>（仍需通过认证 + 端级闸门）。
 * 这是为了让模块能增量接入 —— 新模块开发时不用一上来就配全部权限。
 * <b>等所有 ops 端点都登记完，把默认改成拒绝</b>，并在这里删掉这段注释。
 */
@Component
public class RouteAccessRegistry {

    private static final PathPatternParser PARSER = PathPatternParser.defaultInstance;

    private final List<RouteRule> rules;

    public RouteAccessRegistry() {
        this.rules = buildRules();
    }

    /**
     * 一条路由规则。
     *
     * @param pattern     路径模式（API 前缀已剥离）
     * @param method      限定的 HTTP 方法；null = 所有方法
     * @param resourceKey 资源 key，鉴权时查 {@code access_grant} 表
     */
    public record RouteRule(PathPattern pattern, String method, String resourceKey) {

        boolean appliesTo(String httpMethod) {
            return method == null || method.equalsIgnoreCase(httpMethod);
        }
    }

    /**
     * 解析某个请求路径（API 前缀已剥离）对应的规则。
     *
     * @return 命中的最具体规则；空 = 未注册 = 当前放行
     */
    public Optional<RouteRule> resolve(String requestPath, String httpMethod) {
        PathContainer path = PathContainer.parsePath(requestPath);
        return rules.stream()
                .filter(r -> r.appliesTo(httpMethod))
                .filter(r -> r.pattern().matches(path))
                .min((a, b) -> PathPattern.SPECIFICITY_COMPARATOR.compare(a.pattern(), b.pattern()));
    }

    /** 全部资源 key —— 用于一次性算出"我有哪些权限"喂给前端做菜单。 */
    public java.util.Set<String> resourceKeys() {
        return rules.stream()
                .map(RouteRule::resourceKey)
                .collect(java.util.stream.Collectors.toCollection(java.util.LinkedHashSet::new));
    }

    // ================================================================
    // 路由表 —— 新增 ops 端点在这里加一行
    // ================================================================

    private static List<RouteRule> buildRules() {
        List<RouteRule> r = new ArrayList<>();

        // --- 线索与询价 ---
        rule(r, "/ops/leads/**",              null,   "ops/lead");
        rule(r, "/ops/rfqs/**",               null,   "ops/rfq");

        // --- 零件与图纸 ---
        rule(r, "/ops/parts/**",              null,   "ops/part");
        // ★ 上传脱敏版图纸是敏感操作 —— 脱敏做错就等于把客户身份泄给供应商
        rule(r, "/ops/parts/*/sanitize",      "POST", "ops/part/sanitize");

        // --- 寻源 ---
        rule(r, "/ops/sourcing/**",           null,   "ops/sourcing");
        // ★ 下发寻源包 = 把图纸交到外部供应商手里，单独一个 key
        rule(r, "/ops/sourcing/*/dispatch",   "POST", "ops/sourcing/dispatch");

        // --- 定价与报价 ---
        rule(r, "/ops/pricing/rules/**",      null,   "ops/pricing/rule");
        rule(r, "/ops/quotes/**",             null,   "ops/quote");
        // ★ 审批和发送是护栏 2 的落点，必须和普通报价编辑分开授权 ——
        //    否则"能改报价的人"自动"能批准自己的报价"
        rule(r, "/ops/quotes/*/approve",      "POST", "ops/quote/approve");
        rule(r, "/ops/quotes/*/send",         "POST", "ops/quote/send");
        rule(r, "/ops/quotes/*/withdraw",     "POST", "ops/quote/withdraw");

        // --- 订单与生产 ---
        rule(r, "/ops/orders/**",             null,   "ops/order");
        rule(r, "/ops/production/**",         null,   "ops/production");

        // --- 质检 / 发货 / 单据 ---
        rule(r, "/ops/qc/**",                 null,   "ops/qc");
        rule(r, "/ops/shipments/**",          null,   "ops/shipment");
        rule(r, "/ops/documents/**",          null,   "ops/document");

        // --- 主数据 ---
        rule(r, "/ops/suppliers/**",          null,   "ops/supplier");
        rule(r, "/ops/customers/**",          null,   "ops/customer");

        // --- 管理 ---
        rule(r, "/ops/admin/**",              null,   "ops/admin");
        // ★ 图纸访问日志 —— 合规交付物，只有管理员能导
        rule(r, "/ops/admin/file-access-log/**", null, "ops/admin/file_access_log");

        return List.copyOf(r);
    }

    private static void rule(List<RouteRule> out, String pattern, String method, String resourceKey) {
        out.add(new RouteRule(PARSER.parse(pattern), method, resourceKey));
    }
}
