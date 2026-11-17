package com.mfg.domain.quote;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 机加件成本：AI 给数量，这里按费率表算钱。纯函数，不碰库、不碰 AI。
 *
 * <p>依据《报价逻辑与方法手册》2026-11-15 §3.2：
 * <pre>
 *   批量成本 = 材料 × f_mat + (工时费 − 固定费) × f_mach + 固定费 × f_fix
 * </pre>
 * 这里固定费单独一项（AI 估金额），工时费里不含它，所以写成 材料 × f_mat + 工时费 × f_mach + 固定费 × f_fix。
 *
 * <p>手册没写、属于推导的三处（前提：手册的数量系数只描述机加工时 / 材料 / 固定费）：
 * <ul>
 *   <li>外协不乘数量系数；按件计价的工序（弯管、滚丝等，费率本身已是每件价）也不乘；</li>
 *   <li>按批计价（如每炉次）的项按这一行的数量平摊到每件；</li>
 *   <li>每项金额四舍五入到分，总额 = 各项之和。</li>
 * </ul>
 */
final class EstimateCalculator {

    private static final String MATERIAL = "MATERIAL";
    private static final String PROCESS = "PROCESS";
    private static final String OUTSOURCE = "OUTSOURCE";
    private static final String FIXED = "FIXED";

    private EstimateCalculator() {
    }

    /** 手册 §3.2 数量系数表：1 件 / &lt;10 / &lt;25 / &lt;50 / &lt;100 / ≥100。 */
    static EstimateBreakdown.Factors factorsFor(int quantity) {
        if (quantity <= 1) return factors("1.00", "1.00", "1.00");
        if (quantity < 10) return factors("0.97", "1.00", "0.60");
        if (quantity < 25) return factors("0.94", "0.78", "0.35");
        if (quantity < 50) return factors("0.92", "0.70", "0.20");
        if (quantity < 100) return factors("0.90", "0.65", "0.12");
        return factors("0.87", "0.62", "0.08");
    }

    static EstimateBreakdown calculate(int quantity, AiEstimate ai, List<CostRateSnapshot> rates) {
        EstimateBreakdown.Factors f = factorsFor(quantity);
        Map<String, CostRateSnapshot> byKey = rates.stream()
                .collect(Collectors.toMap(r -> key(r.kind(), r.name()), Function.identity(), (a, b) -> a));
        List<EstimateBreakdown.Item> items = new ArrayList<>();

        String materialName = ai.materialRate() != null ? ai.materialRate() : ai.material();
        items.add(priced(MATERIAL, materialName, ai.blankWeightKg(), byKey.get(key(MATERIAL, ai.materialRate())),
                f.material(), quantity, null));
        for (AiEstimate.Item p : nullSafe(ai.processes())) {
            CostRateSnapshot rate = byKey.get(key(PROCESS, p.rate()));
            BigDecimal factor = rate != null && "HOUR".equals(rate.unit()) ? f.machining() : BigDecimal.ONE;
            items.add(priced(PROCESS, p.rate(), p.quantity(), rate, factor, quantity, p.note()));
        }
        for (AiEstimate.Item o : nullSafe(ai.outsource())) {
            items.add(priced(OUTSOURCE, o.rate(), o.quantity(), byKey.get(key(OUTSOURCE, o.rate())),
                    BigDecimal.ONE, quantity, o.note()));
        }
        BigDecimal fixed = ai.fixedCostCny();
        items.add(new EstimateBreakdown.Item(FIXED, null, null, null, fixed, f.fixed(),
                fixed == null ? null : money(fixed.multiply(f.fixed())), fixed == null, ai.fixedCostNote()));

        BigDecimal total = items.stream().map(EstimateBreakdown.Item::amount)
                .filter(a -> a != null).reduce(BigDecimal.ZERO, BigDecimal::add);
        boolean complete = items.stream().noneMatch(EstimateBreakdown.Item::missing);
        return new EstimateBreakdown(f, List.copyOf(items), money(total), complete);
    }

    private static EstimateBreakdown.Item priced(String kind, String name, BigDecimal qty, CostRateSnapshot rate,
                                                 BigDecimal factor, int lineQuantity, String note) {
        if (rate == null || qty == null) {
            return new EstimateBreakdown.Item(kind, name, qty, rate == null ? null : rate.unit(),
                    rate == null ? null : rate.unitPriceCny(), factor, null, true, note);
        }
        BigDecimal amount = qty.multiply(rate.unitPriceCny()).multiply(factor);
        if ("BATCH".equals(rate.unit())) {
            amount = amount.divide(BigDecimal.valueOf(Math.max(lineQuantity, 1)), 6, RoundingMode.HALF_UP);
        }
        return new EstimateBreakdown.Item(kind, name, qty, rate.unit(), rate.unitPriceCny(), factor, money(amount),
                false, note);
    }

    private static EstimateBreakdown.Factors factors(String material, String machining, String fixed) {
        return new EstimateBreakdown.Factors(new BigDecimal(material), new BigDecimal(machining), new BigDecimal(fixed));
    }

    private static String key(String kind, String name) {
        return kind + "\u0000" + (name == null ? "" : name.strip());
    }

    private static <T> List<T> nullSafe(List<T> list) {
        return list == null ? List.of() : list;
    }

    private static BigDecimal money(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP);
    }
}
