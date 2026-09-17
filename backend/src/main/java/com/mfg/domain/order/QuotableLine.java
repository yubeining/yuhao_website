package com.mfg.domain.order;

import java.util.UUID;

/** 报价要用到的订单行：图号、行上的名称快照、数量。 */
public record QuotableLine(UUID id, String code, String partName, int quantity) {
}
