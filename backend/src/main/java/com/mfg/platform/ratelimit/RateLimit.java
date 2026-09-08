package com.mfg.platform.ratelimit;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 声明式限流：同一 {@code (scope + subject)} 在窗口内超过 {@code limit} 次即拒（429）。
 *
 * <p>把散落在方法体里的 {@code rateLimiter.enforce(scope, subject, n, window)} 提到方法签名上 ——
 * 限流是"这个端点的一条准入规则"，写在注解里比埋在方法第一行更该一眼看见，也和 {@link
 * com.mfg.platform.idempotency.Idempotent @Idempotent} 保持同一种声明式风格。底层仍走
 * {@link com.mfg.common.service.RateLimiter}（Redis 固定窗口 + fail-open）。
 *
 * <h3>subject 怎么定</h3>
 * <ul>
 *   <li>{@link #key} 非空：SpEL 对方法参数求值 —— 按"谁/什么"限。
 *       例 {@code "#request.portalType + ':' + #request.account.toLowerCase()"}（按账号防爆破）。</li>
 *   <li>{@link #key} 留空：回落到<b>客户端 IP 的短 hash</b>（{@code RequestContext.clientIpHash()}）——
 *       公开端点没有账号维度时按来源 IP 限。不落原始 IP（§6/§7）。</li>
 * </ul>
 *
 * <p>{@link #limit} / {@link #windowSeconds} 支持 {@code ${...}} 配置占位符，
 * 这样阈值能走环境变量而不用改代码（如 {@code "${app.auth.login.max-attempts}"}）。
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RateLimit {

    /** 被限的动作，作为 key 的一段（如 {@code "login"} / {@code "lead"}）。 */
    String scope();

    /** 被限主体的 SpEL（引用方法参数 {@code #name} / {@code #p0}）。留空 = 按客户端 IP hash 限。 */
    String key() default "";

    /** 窗口内次数上限。支持 {@code ${...}} 占位符。 */
    String limit();

    /** 窗口长度（秒）。支持 {@code ${...}} 占位符。 */
    String windowSeconds();

    /** 超限时的 i18n code。 */
    String message() default "common.rate_limited";
}
