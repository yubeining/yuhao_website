package com.mfg.domain.quote;

import java.math.BigDecimal;

/** 估算那一刻用到的一条费率。整份列表快照进 {@code price_estimate}，之后改费率不影响已有估算（§10 C2）。 */
record CostRateSnapshot(String kind, String name, String unit, BigDecimal unitPriceCny) {
}
