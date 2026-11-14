package com.mfg.domain.order;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** 订单详情 —— 白名单字段(CLAUDE.md §3 铁律 5)。不含归属组织、创建人。 */
public record OrderView(UUID id, String title, String status, LocalDate wantedDate,
                        Instant createdAt, Instant submittedAt, List<OrderLineView> lines) {
}
