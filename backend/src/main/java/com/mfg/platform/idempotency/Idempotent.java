package com.mfg.platform.idempotency;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 幂等：同一 key 在窗口内只允许一次执行，重复请求直接拒（409）。
 *
 * <p>防"用户手抖点两下 / 前端重试 / 网络重发"造成的重复副作用（重复下单、重复派单）。
 * 机制：进方法前用 Redis {@code SET key val NX EX ttl} 抢占；抢不到说明窗口内已有一次在跑
 * 或刚跑过 → 抛 {@code common.duplicate_request}。方法抛异常时释放锁（失败的调用允许重试），
 * 正常返回则保留到 TTL 到期（真正的重复被挡住）。
 *
 * <p>★ 这不是分布式事务，只挡"短时间内的重复提交"。真正的唯一性（如一个零件只能被接一次）
 * 仍要 DB 唯一约束兜底。
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Idempotent {

    /**
     * 幂等 key，SpEL 表达式，可引用方法参数（按名字 {@code #orderId} 或位置 {@code #p0}）。
     * 例：{@code "#request.orderId"} / {@code "#userId + ':' + #partId"}。
     */
    String key();

    /** 窗口（秒）。窗口内的重复被拒。 */
    int ttlSeconds() default 60;

    /** 被拒时的 i18n code。 */
    String message() default "common.duplicate_request";
}
