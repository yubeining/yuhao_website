package com.mfg.domain.quote;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * 报价设置页的一行：某客户公司自己的报价系数（{@code markupRate} 为空 = 用全局默认），
 * 以及实际生效的值（{@code effectiveRate}）。
 */
public record QuoteCompanyRate(UUID orgId, String name, BigDecimal markupRate, BigDecimal effectiveRate) {
}
