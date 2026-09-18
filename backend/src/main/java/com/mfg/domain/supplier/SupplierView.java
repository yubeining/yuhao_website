package com.mfg.domain.supplier;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * 运营端的一家供应商（白名单字段，CLAUDE.md §3 铁律 5）。没录的字段不出现。
 * {@code dispatchable}：启用中且录了折率，可以被派单。
 */
public record SupplierView(UUID orgId, String name, String status, BigDecimal discountRate, String processes,
                           String materials, String sizeRange, String precisionGrade, boolean dispatchable,
                           Instant createdAt) {
}
