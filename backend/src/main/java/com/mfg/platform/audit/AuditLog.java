package com.mfg.platform.audit;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 声明式审计：方法成功返回后落一条审计事件（{@code audit_event}）。
 *
 * <p>把"记审计"从散落在 service 里的手写调用，收成一个注解 —— 谁做了什么、对哪个对象，
 * 一目了然，也不会漏记。actor（谁）从当前登录态自动取。
 *
 * <p>★ 遵守 CLAUDE.md §6：payload 只放 ID / 枚举 / 计数，绝不放姓名/邮箱/价格/自由文本。
 * 所以这里【不自动 dump 方法参数】—— 只记 action + 目标类型 + 目标 id。需要额外上下文时，
 * 在业务里显式调 {@code AuditService.record}。
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface AuditLog {

    /** 审计动词，格式 {@code <域>.<子域>.<动词>}，状态流转用 {@code <域>.status_change}（§6）。 */
    String action();

    /** 目标类型，如 {@code customer_quote} / {@code sales_order}。 */
    String targetType();

    /** 目标 id 的 SpEL（引用方法参数），如 {@code "#quoteId"} / {@code "#request.orderId"}。可空。 */
    String targetId() default "";
}
