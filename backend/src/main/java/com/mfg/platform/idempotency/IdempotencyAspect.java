package com.mfg.platform.idempotency;

import com.mfg.common.cache.CacheKeys;
import com.mfg.common.exception.BusinessException;
import com.mfg.common.service.RedisService;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.core.DefaultParameterNameDiscoverer;
import org.springframework.core.ParameterNameDiscoverer;
import org.springframework.expression.EvaluationContext;
import org.springframework.expression.Expression;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;
import java.util.UUID;

/**
 * {@link Idempotent} 的切面 —— 用 Redis 抢占式锁挡重复请求。
 *
 * <p>抢到锁 → 执行；方法抛异常 → 释放锁（失败可重试）；正常返回 → 保留锁到 TTL（挡重复）。
 * key 由注解的 SpEL 对方法参数求值得到，前缀 {@code idempotent:<类#方法>:} 避免不同方法撞 key。
 */
@Aspect
@Component
public class IdempotencyAspect {

    private final RedisService redis;
    private final SpelExpressionParser parser = new SpelExpressionParser();
    private final ParameterNameDiscoverer paramNames = new DefaultParameterNameDiscoverer();

    public IdempotencyAspect(RedisService redis) {
        this.redis = redis;
    }

    @Around("@annotation(idempotent)")
    public Object around(ProceedingJoinPoint pjp, Idempotent idempotent) throws Throwable {
        MethodSignature signature = (MethodSignature) pjp.getSignature();
        Method method = signature.getMethod();
        String target = method.getDeclaringClass().getSimpleName() + "#" + method.getName();
        String key = CacheKeys.idempotency(target, resolveKey(idempotent.key(), method, pjp.getArgs()));

        String fence = UUID.randomUUID().toString();
        if (!redis.tryLock(key, fence, idempotent.ttlSeconds())) {
            throw new BusinessException(409, idempotent.message());
        }
        try {
            return pjp.proceed();
        } catch (Throwable t) {
            // 失败释放，让调用方可以重试（成功的那次才占满整个窗口）
            redis.releaseLock(key, fence);
            throw t;
        }
    }

    private String resolveKey(String expression, Method method, Object[] args) {
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
            throw new IllegalStateException("@Idempotent key resolved to null: " + expression);
        }
        return value.toString();
    }
}
