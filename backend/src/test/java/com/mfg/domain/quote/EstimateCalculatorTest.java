package com.mfg.domain.quote;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AI 成本估算的计算部分（AI 只给工时 / 重量 / 外协项，钱由代码按费率算）。
 *
 * <p>依据《报价逻辑与方法手册》2026-11-15 §3.2：
 * 批量成本 = 材料 × f_mat + (工时费 − 固定费) × f_mach + 固定费 × f_fix；数量系数表见 {@link EstimateCalculator}。
 * 这里把固定费单独列一项（AI 直接估金额，需求方 2026-11-17 批准），工时费不含固定费 —— 与手册公式等价（推导）。
 */
class EstimateCalculatorTest {

    private static final List<CostRateSnapshot> RATES = List.of(
            rate("MATERIAL", "steel", "KG", "9.00"),
            rate("PROCESS", "milling", "HOUR", "140.00"),
            rate("PROCESS", "bending", "PIECE", "2.60"),
            rate("OUTSOURCE", "carburizing", "PIECE", "395.00"),
            rate("OUTSOURCE", "galvanizing", "KG", "2.20"),
            rate("OUTSOURCE", "stress-relief", "BATCH", "10000.00"));

    @Test
    void singlePieceUsesFactorOneEverywhere() {
        EstimateBreakdown b = EstimateCalculator.calculate(1, ai(
                "13.5",
                List.of(item("milling", "3.5")),
                List.of(item("carburizing", "1")),
                "260"), RATES);

        assertThat(b.factors().material()).isEqualByComparingTo("1");
        assertThat(b.factors().machining()).isEqualByComparingTo("1");
        assertThat(b.factors().fixed()).isEqualByComparingTo("1");
        // 13.5 × 9 = 121.50；3.5 × 140 = 490；395；260
        assertThat(b.unitCostCny()).isEqualByComparingTo("1266.50");
        assertThat(b.complete()).isTrue();
        assertThat(b.items()).extracting(EstimateBreakdown.Item::amount)
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactly(new BigDecimal("121.50"), new BigDecimal("490.00"),
                        new BigDecimal("395.00"), new BigDecimal("260.00"));
    }

    @Test
    void quantityThirtyAppliesTheUnderFiftyRow() {
        EstimateBreakdown b = EstimateCalculator.calculate(30, ai(
                "10", List.of(item("milling", "1")), List.of(), "100"), RATES);

        // 材料 90 × 0.92 = 82.80；工时 140 × 0.70 = 98.00；固定 100 × 0.20 = 20.00
        assertThat(b.unitCostCny()).isEqualByComparingTo("200.80");
    }

    @Test
    void factorRowsSwitchAtTheHandbookBoundaries() {
        assertThat(EstimateCalculator.factorsFor(1).machining()).isEqualByComparingTo("1.00");
        assertThat(EstimateCalculator.factorsFor(2).fixed()).isEqualByComparingTo("0.60");
        assertThat(EstimateCalculator.factorsFor(9).fixed()).isEqualByComparingTo("0.60");
        assertThat(EstimateCalculator.factorsFor(10).machining()).isEqualByComparingTo("0.78");
        assertThat(EstimateCalculator.factorsFor(24).machining()).isEqualByComparingTo("0.78");
        assertThat(EstimateCalculator.factorsFor(25).machining()).isEqualByComparingTo("0.70");
        assertThat(EstimateCalculator.factorsFor(49).material()).isEqualByComparingTo("0.92");
        assertThat(EstimateCalculator.factorsFor(50).material()).isEqualByComparingTo("0.90");
        assertThat(EstimateCalculator.factorsFor(99).fixed()).isEqualByComparingTo("0.12");
        assertThat(EstimateCalculator.factorsFor(100).fixed()).isEqualByComparingTo("0.08");
        assertThat(EstimateCalculator.factorsFor(5000).material()).isEqualByComparingTo("0.87");
    }

    @Test
    void unknownRateIsFlaggedAndLeftOutOfTheTotal() {
        EstimateBreakdown b = EstimateCalculator.calculate(1, ai(
                "1", List.of(item("five-axis-unknown", "2")), List.of(), "0"), RATES);

        EstimateBreakdown.Item missing = b.items().get(1);
        assertThat(missing.name()).isEqualTo("five-axis-unknown");
        assertThat(missing.missing()).isTrue();
        assertThat(missing.amount()).isNull();
        assertThat(b.complete()).isFalse();
        assertThat(b.unitCostCny()).isEqualByComparingTo("9.00");
    }

    @Test
    void missingBlankWeightFlagsTheMaterial() {
        EstimateBreakdown b = EstimateCalculator.calculate(1, ai(
                null, List.of(item("milling", "1")), List.of(), "0"), RATES);

        assertThat(b.items().get(0).kind()).isEqualTo("MATERIAL");
        assertThat(b.items().get(0).missing()).isTrue();
        assertThat(b.complete()).isFalse();
        assertThat(b.unitCostCny()).isEqualByComparingTo("140.00");
    }

    /** 毛坯重 0 不是一个真实的毛坯：算成 0 元材料费还显示「完整」会让人以为材料白送。 */
    @Test
    void zeroBlankWeightFlagsTheMaterialInsteadOfPricingItAtZero() {
        EstimateBreakdown b = EstimateCalculator.calculate(1, ai(
                "0", List.of(item("milling", "1")), List.of(), "0"), RATES);

        assertThat(b.items().get(0).missing()).isTrue();
        assertThat(b.items().get(0).amount()).isNull();
        assertThat(b.complete()).isFalse();
    }

    /** 模型抄费率名时常把全角括号写成半角、多加或少加空格：这种差别不该变成「缺费率」。 */
    @Test
    void rateNamesMatchAcrossFullWidthPunctuationAndSpacing() {
        List<CostRateSnapshot> rates = List.of(
                rate("MATERIAL", "steel", "KG", "9.00"),
                rate("PROCESS", "数控铣（三轴）", "HOUR", "140.00"),
                rate("OUTSOURCE", "MT + 退磁", "PIECE", "8000.00"));

        EstimateBreakdown b = EstimateCalculator.calculate(1, ai(
                "1", List.of(item("数控铣(三轴)", "1")), List.of(item("MT+退磁", "1")), "0"), rates);

        assertThat(b.complete()).isTrue();
        assertThat(b.unitCostCny()).isEqualByComparingTo("8149.00");
    }

    @Test
    void missingFixedCostIsFlagged() {
        EstimateBreakdown b = EstimateCalculator.calculate(1, ai(
                "1", List.of(), List.of(), null), RATES);

        EstimateBreakdown.Item fixed = b.items().get(b.items().size() - 1);
        assertThat(fixed.kind()).isEqualTo("FIXED");
        assertThat(fixed.missing()).isTrue();
        assertThat(b.complete()).isFalse();
    }

    @Test
    void batchPricedOutsourceIsSpreadOverTheLineQuantity() {
        EstimateBreakdown b = EstimateCalculator.calculate(4, ai(
                "0", List.of(), List.of(item("stress-relief", "1")), "0"), RATES);

        // 10000 / 4 = 2500，外协不乘数量系数
        assertThat(b.items().get(1).amount()).isEqualByComparingTo("2500.00");
    }

    @Test
    void perPieceProcessAndOutsourceByWeightAreNotScaledByTheMachiningFactor() {
        EstimateBreakdown b = EstimateCalculator.calculate(200, ai(
                "0",
                List.of(item("bending", "2")),
                List.of(item("galvanizing", "1.5")),
                "0"), RATES);

        assertThat(b.items().get(1).amount()).isEqualByComparingTo("5.20");   // 2 × 2.60，不乘 0.62
        assertThat(b.items().get(2).amount()).isEqualByComparingTo("3.30");   // 1.5 kg × 2.20
    }

    @Test
    void itemWithoutQuantityIsFlagged() {
        EstimateBreakdown b = EstimateCalculator.calculate(1, ai(
                "0", List.of(item("milling", null)), List.of(), "0"), RATES);

        assertThat(b.items().get(1).missing()).isTrue();
        assertThat(b.complete()).isFalse();
    }

    @Test
    void amountsRoundHalfUpToCents() {
        // 0.005 kg × 9 = 0.045 → 0.05
        EstimateBreakdown b = EstimateCalculator.calculate(1, ai(
                "0.005", List.of(), List.of(), "0"), RATES);

        assertThat(b.items().get(0).amount()).isEqualByComparingTo("0.05");
    }

    // ---------- helpers ----------

    private static CostRateSnapshot rate(String kind, String name, String unit, String price) {
        return new CostRateSnapshot(kind, name, unit, new BigDecimal(price));
    }

    private static AiEstimate.Item item(String rate, String qty) {
        return new AiEstimate.Item(rate, qty == null ? null : new BigDecimal(qty), null);
    }

    private static AiEstimate ai(String blankKg, List<AiEstimate.Item> processes, List<AiEstimate.Item> outsource,
                                 String fixed) {
        return new AiEstimate("MACHINED", null, "steel", "steel", null,
                blankKg == null ? null : new BigDecimal(blankKg),
                processes, outsource,
                fixed == null ? null : new BigDecimal(fixed), null,
                List.of(), List.of());
    }
}
