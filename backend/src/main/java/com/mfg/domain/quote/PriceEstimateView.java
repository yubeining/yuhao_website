package com.mfg.domain.quote;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 运营端：一行订单最新的一次 AI 成本估算。<b>仅内部</b>，不给客户。
 *
 * @param outcome        {@code ESTIMATED} / {@code NOT_MACHINED}
 * @param unitCostCny    每件成本（CNY）；NOT_MACHINED 为空
 * @param complete       明细里没有缺费率 / 缺数量的项
 * @param partTypeReason AI 判断零件类型的理由
 * @param assumptions    AI 用了哪些默认值
 * @param toConfirm      需要找客户确认的点
 * @param readFiles      读了哪些图纸
 * @param skippedFiles   没读的图纸（格式读不了 / 太大 / 超出份数）
 */
public record PriceEstimateView(UUID id, UUID lineId, String outcome, BigDecimal unitCostCny, boolean complete,
                                String partTypeReason, String material, BigDecimal netWeightKg,
                                BigDecimal blankWeightKg, EstimateBreakdown breakdown,
                                List<String> assumptions, List<String> toConfirm,
                                List<String> readFiles, List<String> skippedFiles,
                                String model, Instant estimatedAt) {
}
