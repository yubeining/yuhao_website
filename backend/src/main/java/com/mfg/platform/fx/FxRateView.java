package com.mfg.platform.fx;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * 一条汇率的对外视图（白名单字段，CLAUDE.md §3 铁律 5）：1 个 {@code baseCurrency} 兑 {@code rate} 个 {@code quoteCurrency}。
 *
 * @param rateDate  数据源公布的日期
 * @param fetchedAt 我们拉到它的时刻（UTC）
 */
public record FxRateView(String source, LocalDate rateDate, String baseCurrency, String quoteCurrency,
                         BigDecimal rate, Instant fetchedAt) {

    static FxRateView of(FxRate r) {
        return new FxRateView(r.getSource(), r.getRateDate(), r.getBaseCurrency(), r.getQuoteCurrency(),
                r.getRate(), r.getFetchedAt());
    }
}
