package com.mfg.domain.quote;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * 对供价视图（白名单字段，CLAUDE.md §3 铁律 5）。
 *
 * <p>★ {@code Ops*} 给运营，带原价和折率；给供应商的<b>只有对供单价、小计、合计</b>（2026-09-18 定供应商看得到
 * 数量 + 对供单价 + 小计），原价、折率、对客价都不给。
 */
public final class SupplierPriceViews {

    private SupplierPriceViews() {
    }

    /** 运营看某张生产订单派给某家时的价（按当前折率现算）。 */
    public record OpsSupplierPrice(UUID supplierOrgId, String supplierName, BigDecimal discountRate,
                                   BigDecimal total, List<OpsLinePrice> lines) {
    }

    public record OpsLinePrice(UUID opsOrderLineId, int quantity, BigDecimal baseUnitPriceCny,
                               BigDecimal unitPriceCny, BigDecimal lineTotalCny) {
    }

    /** 供应商看一张派给他的单按他的折率是多少钱（现算，接单时锁定）。 */
    public record OfferPrice(UUID opsOrderId, BigDecimal total, List<LinePrice> lines) {
    }

    public record LinePrice(UUID lineId, BigDecimal unitPriceCny, BigDecimal lineTotalCny) {
    }

    /** 供应商看已接订单的价：接单时的快照。 */
    public record OrderPrice(UUID supplierOrderId, BigDecimal total, List<LinePrice> lines) {
    }
}
