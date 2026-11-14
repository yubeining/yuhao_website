package com.mfg.domain.order;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** 运营端订单详情 —— 白名单字段（CLAUDE.md §3 铁律 5）。行内容和客户端一致。 */
public record OpsOrderView(UUID id, UUID customerOrgId, String customerName, String title, String status,
                           LocalDate wantedDate, Instant createdAt, Instant submittedAt,
                           List<OrderLineView> lines) {
}
