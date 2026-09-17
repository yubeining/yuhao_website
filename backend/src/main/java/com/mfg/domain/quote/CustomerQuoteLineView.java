package com.mfg.domain.quote;

import java.math.BigDecimal;
import java.util.UUID;

/** 客户看到的报价行：只有对客单价和小计，没有原价（2026-09-17 拍板）。 */
public record CustomerQuoteLineView(UUID lineId, String code, String partName, int quantity,
                                    BigDecimal unitPrice, BigDecimal lineTotal) {
}
