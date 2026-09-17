package com.mfg.domain.quote;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 客户看到的报价 —— 白名单字段（CLAUDE.md §3 铁律 5）。<b>不含</b>原价、加成率、汇率数字（2026-09-17 拍板），
 * 只给汇率日期。
 *
 * <p>{@code priceLocked = false}：价格按 {@code rateDate} 那批汇率现算，确认前会随汇率变；
 * 确认时要把 {@code rateDate} 带回来，和服务端当时的不一致就拒绝（客户没看过那个价）。
 * 被拒绝的报价没有价格字段。
 */
public record CustomerQuoteView(UUID id, UUID orderId, String status, String currency, int leadDays,
                                boolean priceLocked, LocalDate rateDate, BigDecimal total,
                                Instant sentAt, Instant confirmedAt, List<CustomerQuoteLineView> lines) {
}
