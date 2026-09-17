package com.mfg.domain.quote;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 对客价 = 原价 × 汇率 × 客户加成率（设计文档 13 §2）。
 *
 * <p>2026-09-17 拍板：加成率填 1.2 = 乘 1.2；对客单价四舍五入到 2 位；小计 = 单价 × 数量；总计 = Σ小计。
 * ECB 只给 EUR→X，CNY→X = (EUR→X) / (EUR→CNY)（推导，前提是同一天的 ECB 批次）。
 */
class PriceCalculatorTest {

    private static final BigDecimal EUR_CNY = new BigDecimal("7.7380");

    @Test
    void eurPriceDividesByTheEurCnyRateAndAppliesTheMarkup() {
        // 100 × 1.2 / 7.738 = 15.5078...
        assertThat(unit("100.00", "1.2", EUR_CNY, BigDecimal.ONE)).isEqualByComparingTo("15.51");
    }

    @Test
    void cnyPriceIsJustTheMarkup() {
        assertThat(unit("100.00", "1.2", EUR_CNY, EUR_CNY)).isEqualByComparingTo("120.00");
    }

    @Test
    void usdPriceCrossesThroughEur() {
        // 100 × 0.9 × 1.1 / 7.738 = 12.7940...
        assertThat(unit("100.00", "0.9", EUR_CNY, new BigDecimal("1.1000"))).isEqualByComparingTo("12.79");
    }

    @Test
    void halfIsRoundedUp() {
        // 0.10 × 1.25 = 0.125
        assertThat(unit("0.10", "1.25", EUR_CNY, EUR_CNY)).isEqualByComparingTo("0.13");
    }

    /** 只在对客单价处取整一次：先把汇率取到 4 位再乘，会得到 129.20 而不是 129.23。 */
    @Test
    void theRateIsNotRoundedBeforeMultiplying() {
        // 1000 / 7.738 = 129.2323...
        assertThat(unit("1000.00", "1", EUR_CNY, BigDecimal.ONE)).isEqualByComparingTo("129.23");
    }

    @Test
    void theResultAlwaysHasTwoDecimals() {
        assertThat(unit("100", "1", EUR_CNY, EUR_CNY).scale()).isEqualTo(2);
    }

    @Test
    void lineTotalsComeFromTheRoundedUnitPriceAndTheTotalSumsThem() {
        PriceCalculator.Priced priced = PriceCalculator.price(
                List.of(new PriceCalculator.Line(new BigDecimal("100.00"), 3),
                        new PriceCalculator.Line(new BigDecimal("1000.00"), 7)),
                new BigDecimal("1.2"),
                new PriceCalculator.Rates(EUR_CNY, BigDecimal.ONE));

        assertThat(priced.lines()).hasSize(2);
        assertThat(priced.lines().get(0).unitPrice()).isEqualByComparingTo("15.51");
        assertThat(priced.lines().get(0).lineTotal()).isEqualByComparingTo("46.53");
        // 1000 × 1.2 / 7.738 = 155.0788... → 155.08；× 7 = 1085.56
        assertThat(priced.lines().get(1).unitPrice()).isEqualByComparingTo("155.08");
        assertThat(priced.lines().get(1).lineTotal()).isEqualByComparingTo("1085.56");
        assertThat(priced.total()).isEqualByComparingTo("1132.09");
        assertThat(priced.total().scale()).isEqualTo(2);
    }

    @Test
    void anEmptyQuoteTotalsZero() {
        PriceCalculator.Priced priced = PriceCalculator.price(List.of(), BigDecimal.ONE,
                new PriceCalculator.Rates(EUR_CNY, BigDecimal.ONE));
        assertThat(priced.total()).isEqualByComparingTo("0.00");
    }

    private static BigDecimal unit(String cny, String markup, BigDecimal eurCny, BigDecimal eurQuote) {
        return PriceCalculator.unitPrice(new BigDecimal(cny), new BigDecimal(markup),
                new PriceCalculator.Rates(eurCny, eurQuote));
    }
}
