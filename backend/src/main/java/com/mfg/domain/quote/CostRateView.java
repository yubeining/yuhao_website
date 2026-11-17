package com.mfg.domain.quote;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** 运营端：费率表的一条。{@code kind} / {@code unit} 是枚举名，前端翻译。 */
public record CostRateView(UUID id, String kind, String name, String unit, BigDecimal unitPriceCny, String note,
                           Instant updatedAt) {
}
