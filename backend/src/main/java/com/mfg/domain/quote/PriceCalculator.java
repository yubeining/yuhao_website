package com.mfg.domain.quote;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * 对客价 = 原价 × 汇率 × 客户加成率（设计文档 13 §2）。纯函数，不查库。
 *
 * <p>2026-09-17 拍板：加成率 1.2 = 乘 1.2；对客单价四舍五入到 2 位；小计 = 单价 × 数量；总计 = Σ小计。
 *
 * <p>汇率：ECB 只给 1 EUR 兑各币种，所以 CNY→对客币种 = (EUR→对客币种) / (EUR→CNY)，两个值取自同一天的批次。
 * 对客币种是 EUR 时 EUR→对客币种 = 1；是 CNY 时两者相等，结果就是 原价 × 加成率。
 * ★ 除法放在最后、只取整一次 —— 先把汇率取几位再乘，大单价会差出几分钱。
 */
final class PriceCalculator {

    private static final int SCALE = 2;

    /** 同一天 ECB 批次里的两个值：1 EUR 兑多少 CNY、1 EUR 兑多少对客币种。 */
    record Rates(BigDecimal eurCny, BigDecimal eurQuote) {
    }

    /** 一行的原价（CNY / 件）和数量。 */
    record Line(BigDecimal unitPriceCny, int quantity) {
    }

    record PricedLine(BigDecimal unitPrice, BigDecimal lineTotal) {
    }

    record Priced(List<PricedLine> lines, BigDecimal total) {
    }

    private PriceCalculator() {
    }

    static BigDecimal unitPrice(BigDecimal unitPriceCny, BigDecimal markupRate, Rates rates) {
        return unitPriceCny.multiply(markupRate).multiply(rates.eurQuote())
                .divide(rates.eurCny(), SCALE, RoundingMode.HALF_UP);
    }

    static Priced price(List<Line> lines, BigDecimal markupRate, Rates rates) {
        List<PricedLine> priced = lines.stream()
                .map(l -> {
                    BigDecimal unit = unitPrice(l.unitPriceCny(), markupRate, rates);
                    return new PricedLine(unit, unit.multiply(BigDecimal.valueOf(l.quantity())));
                })
                .toList();
        BigDecimal total = priced.stream()
                .map(PricedLine::lineTotal)
                .reduce(BigDecimal.ZERO.setScale(SCALE), BigDecimal::add);
        return new Priced(priced, total);
    }
}
