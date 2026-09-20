package com.mfg.domain.order;

import java.util.UUID;

/**
 * 订单里的一个零件行。{@code revision} 是这一行锁定的图纸版本（CLAUDE.md §3 铁律 7），
 * {@code partName} 是行上的快照，{@code partNo} 编号规则未定、不对外。
 *
 * <p>{@code fulfillmentStatus} 是折叠过的四态（待安排 / 进行中 / 已完成 / 已取消，文档 12 §7）——
 * 供应侧的返工、报废、换供应商一律折成「进行中」，客户看不到也不该看到。
 */
public record OrderLineView(UUID id, UUID partId, String code, String partName, int quantity,
                            String material, String surfaceTreatment, String fulfillmentStatus,
                            RevisionView revision) {
}
