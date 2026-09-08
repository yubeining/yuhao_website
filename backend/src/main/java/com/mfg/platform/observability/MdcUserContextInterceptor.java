package com.mfg.platform.observability;

import com.mfg.common.security.UserPrincipal;
import com.mfg.common.web.MdcKeys;
import com.mfg.common.web.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 认证之后把 userId + portal 塞进 MDC，让日志一行看清"谁 + 哪个端 + traceId"。
 *
 * <p>跑在 Security 链之后（拦截器阶段 principal 已就绪），比 RequestTraceFilter 晚 ——
 * 后者在认证之前，只放得了 traceId。清理在 {@code afterCompletion}。
 */
@Component
public class MdcUserContextInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        UserPrincipal principal = RequestContext.principal();
        if (principal != null) {
            MDC.put(MdcKeys.USER_ID, principal.id().toString());
            MDC.put(MdcKeys.PORTAL, principal.partyType().name());
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        MDC.remove(MdcKeys.USER_ID);
        MDC.remove(MdcKeys.PORTAL);
    }
}
