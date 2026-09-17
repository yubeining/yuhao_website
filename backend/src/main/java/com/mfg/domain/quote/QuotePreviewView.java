package com.mfg.domain.quote;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** 运营发出前的试算：用当前客户加成率和最新一批汇率算，不落库。 */
public record QuotePreviewView(String currency, BigDecimal markupRate, LocalDate rateDate, BigDecimal fxEurCny,
                               BigDecimal fxEurQuote, BigDecimal total, List<OpsQuoteLineView> lines) {
}
