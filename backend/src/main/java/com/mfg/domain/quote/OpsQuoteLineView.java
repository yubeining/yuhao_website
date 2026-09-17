package com.mfg.domain.quote;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * 运营端报价的一行。{@code unitPriceCny} 是原价；{@code unitPrice} / {@code lineTotal} 是对客价：
 * 已确认的取确认时的快照，未确认的按最新汇率现算，算不出来（没有汇率 / 已作废）为空。
 */
public record OpsQuoteLineView(UUID lineId, String code, String partName, int quantity,
                               BigDecimal unitPriceCny, BigDecimal unitPrice, BigDecimal lineTotal) {
}
