package com.mfg.platform.audit;

import com.mfg.common.security.UserPrincipal;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.AfterReturning;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.core.DefaultParameterNameDiscoverer;
import org.springframework.core.ParameterNameDiscoverer;
import org.springframework.expression.EvaluationContext;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * {@link AuditLog} 的切面 —— 方法成功返回后落审计。
 *
 * <p>actor 从 SecurityContext 的 {@link UserPrincipal} 取；targetId 由注解 SpEL 求值。
 * payload 只放 {@code method} 名（§6：不放 PII/自由文本）。审计写失败由 {@link AuditService} 内部吞掉，
 * 不影响业务返回。
 *
 * <p><b>已知边界</b>：审计在业务方法返回后、可能仍在同一事务内写（{@link AuditService#record}
 * 是 REQUIRED）。业务事务在更外层回滚时这条审计会一起回滚 —— 后续把 {@code record} 改成
 * {@code REQUIRES_NEW} 可解耦（尤其图纸访问审计那条红线，另行处理）。
 */
@Aspect
@Component
public class AuditLogAspect {

    private final AuditService auditService;
    private final SpelExpressionParser parser = new SpelExpressionParser();
    private final ParameterNameDiscoverer paramNames = new DefaultParameterNameDiscoverer();

    public AuditLogAspect(AuditService auditService) {
        this.auditService = auditService;
    }

    @AfterReturning("@annotation(auditLog)")
    public void record(JoinPoint joinPoint, AuditLog auditLog) {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();

        String targetId = auditLog.targetId().isBlank()
                ? null : resolve(auditLog.targetId(), method, joinPoint.getArgs());

        UserPrincipal actor = currentPrincipal();
        Map<String, Object> payload = new HashMap<>();
        payload.put("method", method.getDeclaringClass().getSimpleName() + "#" + method.getName());

        auditService.record(auditLog.action(), auditLog.targetType(), targetId,
                actor == null ? null : actor.id(),
                actor == null ? null : actor.partyId(),
                payload);
    }

    private String resolve(String expression, Method method, Object[] args) {
        EvaluationContext context = new StandardEvaluationContext();
        String[] names = paramNames.getParameterNames(method);
        for (int i = 0; i < args.length; i++) {
            context.setVariable("p" + i, args[i]);
            context.setVariable("a" + i, args[i]);
            if (names != null && i < names.length) {
                context.setVariable(names[i], args[i]);
            }
        }
        Object value = parser.parseExpression(expression).getValue(context);
        return value == null ? null : value.toString();
    }

    private static UserPrincipal currentPrincipal() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return null;
        }
        return auth.getPrincipal() instanceof UserPrincipal up ? up : null;
    }
}
