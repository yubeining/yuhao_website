package com.mfg.domain.order;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * 订单域发布给报价域的契约（CLAUDE.md §2：跨域只走接口 + record）。依赖方向是「报价 → 订单」，订单域不知道报价。
 *
 * <p>状态由订单域自己判、自己改：报价域只说「报了 / 确认了 / 拒了」，能不能改由这里决定（谁的数据谁来判）。
 *
 * <p>★ 加锁：{@code lock*} 方法给订单行加 {@code FOR UPDATE}，锁到调用方事务结束，必须在调用方的事务里调。
 * 报价、确认、拒绝都先锁订单，于是对同一张订单只能排队。
 */
public interface OrderQuoting {

    /** 运营端读一张提交过的单。草稿或不存在 → 404。 */
    QuotableOrder findSubmitted(UUID orderId);

    /**
     * 运营报价前锁单。草稿或不存在 → 404；不是「已提交 / 已报价」→ 409 {@code order.not_quotable}。
     */
    QuotableOrder lockForQuoting(UUID orderId);

    /** 已提交 → 已报价；已经是已报价（重报）则不动。 */
    void markQuoted(UUID customerOrgId, UUID orderId);

    /** 客户确认 / 拒绝前锁单。不是这个客户的或不存在 → 404。不判状态。 */
    QuotableOrder lockForCustomer(UUID customerOrgId, UUID orderId);

    /** 已报价 → 已确认。不是已报价 → 409 {@code order.not_quoted}。 */
    void markConfirmed(UUID customerOrgId, UUID orderId);

    /** 已报价 → 已提交（客户拒绝，等运营重报）。不是已报价 → 409 {@code order.not_quoted}。 */
    void markRejected(UUID customerOrgId, UUID orderId);

    /** 客户自己的订单名称，给报价列表显示用。没有名称的不在结果里。 */
    Map<UUID, String> titles(UUID customerOrgId, Collection<UUID> orderIds);
}
