package com.mfg.platform.fx;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;

/**
 * ECB 某一天公布的参考汇率：1 EUR 兑多少各币种。
 *
 * @param date  ECB 的发布日期（CET 日历日），不是我们拉取的时刻
 * @param rates 币种代码（ISO 4217，三位大写）→ 汇率
 */
record EcbDailyRates(LocalDate date, Map<String, BigDecimal> rates) {
}
