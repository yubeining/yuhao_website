package com.mfg.common.web;

import com.mfg.common.security.AuthContext;
import com.mfg.common.security.PartyType;
import com.mfg.common.security.UserPrincipal;

import java.util.UUID;

/**
 * 请求级上下文的<b>统一门面</b> —— 一个请求里"我是谁、从哪来、追踪 id 是啥"都从这里读，
 * 不再散落成一堆 {@code SecurityContextHolder.get} / {@code MDC.get} / {@code request.getHeader}。
 *
 * <h3>怎么组织的</h3>
 * <ul>
 *   <li><b>traceId / clientIp</b>：请求进来时由 {@code RequestTraceFilter} 用 {@link #begin} 放进
 *       一个 ThreadLocal，请求结束 {@link #clear}。服务层不用把 HttpServletRequest 层层传下去也能拿到。</li>
 *   <li><b>登录态（principal / userId / portal）</b>：<b>不复制</b>，实时委托给
 *       {@link AuthContext}（真源是 Spring Security 的 SecurityContext）—— 避免两份状态漂移。</li>
 * </ul>
 *
 * <p>线程池复用线程，所以 {@link #clear} 必须在 finally 里调，否则上一个请求的 traceId/ip 会串到下一个。
 */
public final class RequestContext {

    private record Scope(String traceId, String clientIp) {
    }

    private static final ThreadLocal<Scope> HOLDER = new ThreadLocal<>();

    private RequestContext() {
    }

    // ---------- 生命周期（由 RequestTraceFilter 调）----------

    public static void begin(String traceId, String clientIp) {
        HOLDER.set(new Scope(traceId, clientIp));
    }

    public static void clear() {
        HOLDER.remove();
    }

    // ---------- 读 ----------

    public static String traceId() {
        Scope s = HOLDER.get();
        return s == null ? null : s.traceId();
    }

    public static String clientIp() {
        Scope s = HOLDER.get();
        return s == null ? null : s.clientIp();
    }

    /** 客户端 IP 的短 hash —— 落限流 key / 审计用，不落原始 IP（§6/§7）。无上下文时返回 "unknown"。 */
    public static String clientIpHash() {
        String ip = clientIp();
        return ip == null ? "unknown" : ClientIp.hash(ip);
    }

    /** 当前登录用户；未登录返回 null。委托 AuthContext（真源是 SecurityContext）。 */
    public static UserPrincipal principal() {
        return AuthContext.currentPrincipal();
    }

    public static UUID userId() {
        UserPrincipal p = principal();
        return p == null ? null : p.id();
    }

    public static PartyType portal() {
        UserPrincipal p = principal();
        return p == null ? null : p.partyType();
    }
}
