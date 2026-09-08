package com.mfg.platform.ratelimit;

import com.mfg.common.exception.BusinessException;
import com.mfg.common.service.RateLimiter;
import com.mfg.common.web.RequestContext;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.core.DefaultParameterNameDiscoverer;
import org.springframework.core.ParameterNameDiscoverer;
import org.springframework.core.env.Environment;
import org.springframework.expression.EvaluationContext;
import org.springframework.expression.Expression;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;
import java.time.Duration;

/**
 * {@link RateLimit} 的切面 —— 进方法前按 {@code (scope, subject)} 计数，超限抛 429。
 *
 * <p>subject：注解 {@code key} 非空时用 SpEL 对方法参数求值；留空时回落到
 * {@link RequestContext#clientIpHash()}（公开端点按来源 IP 限，不落原始 IP）。
 * {@code limit} / {@code windowSeconds} 先经 {@link Environment#resolvePlaceholders} 解析
 * {@code ${...}}，再转成数字 —— 阈值可走配置/环境变量。
 *
 * <p>真正的计数与 fail-open 都在 {@link RateLimiter}；这里只做"从注解和请求上下文里凑齐参数"。
 */
@Aspect
@Component
public class RateLimitAspect {

    private final RateLimiter rateLimiter;
    private final Environment environment;
    private final SpelExpressionParser parser = new SpelExpressionParser();
    private final ParameterNameDiscoverer paramNames = new DefaultParameterNameDiscoverer();

    public RateLimitAspect(RateLimiter rateLimiter, Environment environment) {
        this.rateLimiter = rateLimiter;
        this.environment = environment;
    }

    @Around("@annotation(rateLimit)")
    public Object around(ProceedingJoinPoint pjp, RateLimit rateLimit) throws Throwable {
        MethodSignature signature = (MethodSignature) pjp.getSignature();
        Method method = signature.getMethod();

        String subject = resolveSubject(rateLimit.key(), method, pjp.getArgs());
        int limit = resolveInt(rateLimit.limit(), "limit");
        int windowSeconds = resolveInt(rateLimit.windowSeconds(), "windowSeconds");

        if (!rateLimiter.tryAcquire(rateLimit.scope(), subject, limit, Duration.ofSeconds(windowSeconds))) {
            throw new BusinessException(429, rateLimit.message());
        }
        return pjp.proceed();
    }

    /** key 留空 → 客户端 IP hash；否则 SpEL 求值。 */
    private String resolveSubject(String expression, Method method, Object[] args) {
        if (expression == null || expression.isBlank()) {
            return RequestContext.clientIpHash();
        }
        Expression expr = parser.parseExpression(expression);
        EvaluationContext context = new StandardEvaluationContext();
        String[] names = paramNames.getParameterNames(method);
        for (int i = 0; i < args.length; i++) {
            context.setVariable("p" + i, args[i]);
            context.setVariable("a" + i, args[i]);
            if (names != null && i < names.length) {
                context.setVariable(names[i], args[i]);
            }
        }
        Object value = expr.getValue(context);
        if (value == null) {
            throw new IllegalStateException("@RateLimit key resolved to null: " + expression);
        }
        return value.toString();
    }

    /** 支持 {@code ${...}} 占位符的整数配置项。 */
    private int resolveInt(String raw, String field) {
        String resolved = environment.resolvePlaceholders(raw).trim();
        try {
            return Integer.parseInt(resolved);
        } catch (NumberFormatException e) {
            throw new IllegalStateException(
                    "@RateLimit " + field + " must resolve to an integer, got: " + resolved);
        }
    }
}
