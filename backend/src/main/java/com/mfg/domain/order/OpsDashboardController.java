package com.mfg.domain.order;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 运营工作台：<b>只放有确定数据来源的计数</b>（CLAUDE.md §10 C5）。
 *
 * <p>工作台原先那五个指标里，只有三个能在后端找到唯一的来源 —— 每个都直接对应一个状态枚举值，
 * 不需要「产能」「锁满」「考察中」这类后端不存在的概念：
 *
 * <table>
 *   <tr><th>指标</th><th>来源</th></tr>
 *   <tr><td>待安排生产</td><td>{@code customer_order.status = CONFIRMED}（报价已确认，等运营组包）</td></tr>
 *   <tr><td>组包中</td><td>{@code ops_order.status = ASSEMBLING}（草稿，还没挂出去）</td></tr>
 *   <tr><td>在挂生产订单</td><td>{@code ops_order.status ∈ (OFFERED, PUBLISHED)}（等供应商接单）</td></tr>
 * </table>
 *
 * <p>另外两个（「已安排生产 · 产能没锁满」「待考察供应商 · 已提交材料」）没有来源，<b>不放进来</b>：
 * 后端既没有产能字段，也没有「考察中」状态。要加这两个指标，先定它们的口径，不要在这里拼一个像样的映射。
 *
 * <p>计数是跨客户的，运营端本来就没有租户条件（同 {@code OpsDispatchController}）。
 */
@RestController
class OpsDashboardController {

    private final CustomerOrderRepository customerOrders;
    private final OpsOrderRepository opsOrders;

    OpsDashboardController(CustomerOrderRepository customerOrders, OpsOrderRepository opsOrders) {
        this.customerOrders = customerOrders;
        this.opsOrders = opsOrders;
    }

    /** 三个计数并列给出，不合成总分 —— 合起来没有业务含义，只会让人问「一共多少」而得不到答案。 */
    public record OpsDashboardView(long pendingAssembly, long assembling, long offered) {
    }

    @GetMapping("/ops/dashboard")
    OpsDashboardView dashboard() {
        long pendingAssembly = customerOrders.countByStatus(CustomerOrder.Status.CONFIRMED);
        long assembling = opsOrders.countByStatus(OpsOrder.Status.ASSEMBLING);
        long offered = opsOrders.countByStatus(OpsOrder.Status.OFFERED)
                + opsOrders.countByStatus(OpsOrder.Status.PUBLISHED);
        return new OpsDashboardView(pendingAssembly, assembling, offered);
    }
}
