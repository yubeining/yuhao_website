package com.mfg.common.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 注入当前调用方的 {@code partyId}（UUID）。
 *
 * <pre>
 * &#64;GetMapping("/rfqs/{id}")
 * public RfqResponse get(&#64;CurrentParty UUID partyId, &#64;PathVariable UUID id) {
 *     return rfqService.get(partyId, id);   // ★ partyId 显式传进 service
 * }
 * </pre>
 *
 * <p><b>为什么必须由 controller 显式传给 service</b>（CLAUDE.md §5 铁律 1）：
 * 如果 service 自己去 SecurityContext 里取，那么这个方法就无法被
 * 定时任务 / 内部流程 / 测试以别的身份调用，更重要的是 —— 从方法签名上
 * <b>看不出它有没有做租户隔离</b>。签名里带 {@code partyId} 的方法，
 * code review 时一眼能判断；不带的就是嫌疑对象。
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CurrentParty {
}
