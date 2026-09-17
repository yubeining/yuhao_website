package com.mfg.domain.order;

import java.time.Instant;
import java.util.UUID;

/**
 * 运营端订单列表的一行 —— 白名单字段（CLAUDE.md §3 铁律 5）。
 * {@code customerName} 是列表时取的当前客户名，不是快照；{@code wantedLeadDays} 是客户期望，仅参考。
 */
public record OpsOrderSummaryView(UUID id, UUID customerOrgId, String customerName, String title, String status,
                                  Integer wantedLeadDays, long lineCount, long totalQuantity,
                                  Instant createdAt, Instant submittedAt) {
}
