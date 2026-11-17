package com.mfg.domain.quote;

import java.math.BigDecimal;
import java.util.List;

/**
 * 一次成本估算的明细，存进 {@code price_estimate.breakdown}，也原样给运营端看。
 *
 * @param unitCostCny 每件成本（CNY），只加算得出来的项
 * @param complete    所有项都算得出来；有缺费率 / 缺数量的项时为 false，总额偏低
 */
public record EstimateBreakdown(Factors factors, List<Item> items, BigDecimal unitCostCny, boolean complete) {

    /** 手册 §3.2 的数量系数：材料 / 工时 / 固定费。 */
    public record Factors(BigDecimal material, BigDecimal machining, BigDecimal fixed) {
    }

    /**
     * 一项成本。
     *
     * @param kind        {@code MATERIAL} / {@code PROCESS} / {@code OUTSOURCE} / {@code FIXED}
     * @param name        费率名（FIXED 为空）
     * @param quantity    AI 给的数量（kg / 小时 / 次 / 批）；FIXED 为空
     * @param unit        费率单位 {@code KG} / {@code HOUR} / {@code PIECE} / {@code BATCH}；缺费率或 FIXED 为空
     * @param unitPriceCny 费率；FIXED 为 AI 估的金额
     * @param factor      乘上的数量系数（不乘为 1）
     * @param amount      每件金额；算不出来为空
     * @param missing     缺费率或缺数量
     * @param note        AI 对这一项的说明
     */
    public record Item(String kind, String name, BigDecimal quantity, String unit, BigDecimal unitPriceCny,
                       BigDecimal factor, BigDecimal amount, boolean missing, String note) {
    }
}
