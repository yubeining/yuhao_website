package com.mfg.domain.order;

import java.util.UUID;

/**
 * 订单里的一个零件行。{@code revision} 是这一行锁定的图纸版本（CLAUDE.md §3 铁律 7），
 * {@code partName} 是行上的快照，{@code partNo} 编号规则未定、不对外。
 */
public record OrderLineView(UUID id, UUID partId, String code, String partName, int quantity,
                            String material, String surfaceTreatment, RevisionView revision) {
}
