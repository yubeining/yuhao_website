package com.mfg.domain.order;

import java.time.Instant;
import java.util.UUID;

/** 订单列表的一行 —— 白名单字段(CLAUDE.md §3 铁律 5)。{@code wantedLeadDays} 是客户期望，仅参考。 */
public record OrderSummaryView(UUID id, String title, String status, Integer wantedLeadDays,
                               long lineCount, long totalQuantity, Instant createdAt, Instant submittedAt) {
}
