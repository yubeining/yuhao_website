package com.mfg.domain.quote;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** 客户报价列表的一行（只列待确认和已确认的）。字段含义同 {@link CustomerQuoteView}。 */
public record CustomerQuoteSummaryView(UUID id, UUID orderId, String orderTitle, String status, String currency,
                                       int leadDays, boolean priceLocked, LocalDate rateDate, BigDecimal total,
                                       Instant sentAt, Instant confirmedAt) {
}
