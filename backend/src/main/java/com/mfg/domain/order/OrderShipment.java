package com.mfg.domain.order;

import java.time.Instant;

/**
 * 客户订单的发货信息（2026-11-24 拍板）。运营发货后才有；承运商是自由文本（三方运输公司还没定）。
 * 白名单字段：发货的运营是谁不对外。
 */
public record OrderShipment(String carrier, String trackingNo, Instant shippedAt, Instant receivedAt) {
}
