package com.mfg.domain.order;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 订单详情 —— 白名单字段(CLAUDE.md §3 铁律 5)。不含归属组织、创建人。
 * {@code shipment} 发货后才有；{@code documents} 只列传完的随货文件（2026-11-24）。
 */
public record OrderView(UUID id, String title, String status, LocalDate wantedDate,
                        Instant createdAt, Instant submittedAt, ShipTo shipTo, List<OrderLineView> lines,
                        OrderShipment shipment, List<OrderDocumentView> documents) {
}
