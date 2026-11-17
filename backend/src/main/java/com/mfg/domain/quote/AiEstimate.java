package com.mfg.domain.quote;

import java.math.BigDecimal;
import java.util.List;

/**
 * AI 读图之后给出的结构化结果（模型输出的 JSON 直接绑到这里）。<b>只有数量，没有钱</b> ——
 * 钱由 {@link EstimateCalculator} 按费率表算（需求方 2026-11-17：AI 只估成本，算法用代码）。
 *
 * <p>唯一的例外是 {@code fixedCostCny}（编程 / 装夹 / 首检这类不随数量变的费用）：手册没有它的费率，
 * 案例里是直接估金额，需求方 2026-11-17 批准由 AI 直接估，界面上标「AI 估」。
 * 口径是「单件试制时一件承担的固定费」，再由计算器乘手册 §3.2 的 f_fix 摊薄 ——
 * 不是整行总额（2026-11-17 回归发现提示词写成了整行总额，和计算器按每件相加对不上，已改）。
 *
 * @param partType       {@code MACHINED} 机加件；其他一律 {@code OTHER}，第一版不估
 * @param partTypeReason 为什么这么判
 * @param material       图纸 / 订单行上读到的材料原文
 * @param materialRate   对应费率表里哪一条材料（名称）；对不上为空
 * @param netWeightKg    净重
 * @param blankWeightKg  毛坯重（含余量、装夹头），材料费按它算
 * @param processes      工序：费率名 + 数量（按小时计价的是工时，按件计价的是每件次数）
 * @param outsource      外协：费率名 + 数量（按 kg 的是重量，按件的是每件次数，按批的是批数）
 * @param assumptions    用了哪些默认值（图上没写、按常见做法假设的）
 * @param toConfirm      需要找客户确认的点
 */
record AiEstimate(String partType, String partTypeReason, String material, String materialRate,
                  BigDecimal netWeightKg, BigDecimal blankWeightKg,
                  List<Item> processes, List<Item> outsource,
                  BigDecimal fixedCostCny, String fixedCostNote,
                  List<String> assumptions, List<String> toConfirm) {

    static final String MACHINED = "MACHINED";

    record Item(String rate, BigDecimal quantity, String note) {
    }

    boolean machined() {
        return MACHINED.equals(partType);
    }
}
