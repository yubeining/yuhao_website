package com.mfg.domain.order;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** 订单列表的一行 —— 白名单字段(CLAUDE.md §3 铁律 5)。{@code wantedDate} 是客户期望的日期，仅参考。 */
public record OrderSummaryView(UUID id, String title, String status, LocalDate wantedDate,
                               long lineCount, long totalQuantity, Instant createdAt, Instant submittedAt) {
}
