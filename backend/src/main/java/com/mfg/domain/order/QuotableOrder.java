package com.mfg.domain.order;

import java.util.List;
import java.util.UUID;

/** 报价要用到的订单内容。{@code lines} 按客户加行的顺序。 */
public record QuotableOrder(UUID id, UUID customerOrgId, String status, List<QuotableLine> lines) {
}
