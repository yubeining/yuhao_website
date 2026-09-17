package com.mfg.domain.quote;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 运营端的一版报价 —— 白名单字段（CLAUDE.md §3 铁律 5）。
 *
 * <p>{@code priceLocked = true}：汇率和对客价是客户确认时的快照；否则是按 {@code rateDate} 那批汇率现算的，
 * 只对 {@code SENT} 算，作废 / 被拒的版本不算（价格字段为空）。
 */
public record OpsQuoteView(UUID id, int versionNo, String status, String currency, int leadDays,
                           BigDecimal markupRate, Instant sentAt, Instant confirmedAt, Instant rejectedAt,
                           boolean priceLocked, LocalDate rateDate, BigDecimal fxEurCny, BigDecimal fxEurQuote,
                           BigDecimal total, List<OpsQuoteLineView> lines) {
}
