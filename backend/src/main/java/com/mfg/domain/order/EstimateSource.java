package com.mfg.domain.order;

import java.util.List;
import java.util.UUID;

/**
 * AI 成本估算要用到的一行订单内容：行上的快照字段 + 这一行锁定版本下的图纸。
 *
 * @param drawings 读出来的图纸（只含调用方说能读的格式、且不超过大小上限的）
 * @param skipped  没读的图纸文件名（格式读不了 / 太大 / 超出份数）
 */
public record EstimateSource(UUID orderId, UUID lineId, UUID customerOrgId, String code, String partName,
                             int quantity, String material, String surfaceTreatment,
                             List<DrawingContent> drawings, List<String> skipped) {
}
