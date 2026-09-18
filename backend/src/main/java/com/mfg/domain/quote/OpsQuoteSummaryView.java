package com.mfg.domain.quote;

import java.util.UUID;

/** 运营端订单列表上的报价标记：这张单最新一版报价的版本号和状态。没报过价的单不在结果里。 */
public record OpsQuoteSummaryView(UUID orderId, int latestVersionNo, String latestStatus) {
}
