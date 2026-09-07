package com.mfg.platform.observability;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * 给每个请求打一个 traceId，放进 MDC，让本次请求产生的每一行日志都带上它。
 *
 * <h3>为什么要它</h3>
 * <p>并发下多个请求的日志在同一个文件里逐行交织，没有 id 就没法把"这一个请求"的日志
 * 挑出来 —— 排查线上问题时基本靠猜。有了 traceId，一次 grep 就是完整一条链路。
 *
 * <h3>行为</h3>
 * <ul>
 *   <li>入口读 {@code X-Request-Id} 头：上游（网关 / 前端）传了就沿用，
 *       让一条请求在多个服务/多端之间用同一个 id 串起来；没传就本地生成。</li>
 *   <li>把 traceId 写回响应头，前端/客户报障时能把 id 一起给过来。</li>
 *   <li>{@code finally} 里清掉 MDC —— 线程会被线程池复用，不清就会把上一个请求的 id
 *       带到下一个请求（串味）。</li>
 * </ul>
 *
 * <h3>顺序</h3>
 * <p>{@link Ordered#HIGHEST_PRECEDENCE}：跑在 Spring Security 过滤链之前，
 * 这样连认证失败、端级闸门拒绝这些日志也带 traceId。
 *
 * <h3>安全</h3>
 * <p>沿用上游传入的 id 前先消毒 —— 只允许 {@code [A-Za-z0-9_-]}、长度设上限，
 * 否则别人往这个头里塞换行/控制字符就能伪造日志行（log injection）。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestTraceFilter extends OncePerRequestFilter {

    public static final String MDC_KEY = "traceId";
    public static final String HEADER = "X-Request-Id";

    private static final int MAX_INCOMING_LENGTH = 64;

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        String traceId = resolve(request.getHeader(HEADER));
        MDC.put(MDC_KEY, traceId);
        response.setHeader(HEADER, traceId);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }

    private static String resolve(String incoming) {
        if (incoming != null && !incoming.isBlank()
                && incoming.length() <= MAX_INCOMING_LENGTH && isSafe(incoming)) {
            return incoming;
        }
        return generate();
    }

    /** 16 位十六进制，够区分、又比完整 UUID 短，日志里好读。 */
    private static String generate() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 16);
    }

    private static boolean isSafe(String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            boolean ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
                    || (c >= '0' && c <= '9') || c == '-' || c == '_';
            if (!ok) {
                return false;
            }
        }
        return true;
    }
}
