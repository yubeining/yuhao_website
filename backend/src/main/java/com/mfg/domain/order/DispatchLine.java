package com.mfg.domain.order;

import java.util.UUID;

/** 生产订单的一行：属于哪张单、来自哪个客户零件行、做几件。 */
public record DispatchLine(UUID opsOrderId, UUID opsOrderLineId, UUID customerOrderPartId, int quantity) {
}
