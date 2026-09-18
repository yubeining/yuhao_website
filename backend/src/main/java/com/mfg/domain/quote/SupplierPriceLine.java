package com.mfg.domain.quote;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * 接单那一刻的对供价快照（一行供应商订单一条）：原价、折率、对供单价、小计。之后改折率、改原价都不影响它
 * （CLAUDE.md §10 C2）。价格不往订单域的表加列（文档 13 §3.5），所以在报价域单独一张表。只增不改。
 */
@Entity
@Table(name = "supplier_price_line")
class SupplierPriceLine extends BaseEntity {

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "supplier_order_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID supplierOrderId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "supplier_order_part_id", columnDefinition = "uuid", nullable = false, updatable = false,
            unique = true)
    private UUID supplierOrderPartId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "supplier_org_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID supplierOrgId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_order_part_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID customerOrderPartId;

    @Column(name = "quantity", nullable = false, updatable = false)
    private int quantity;

    @Column(name = "base_unit_price_cny", nullable = false, updatable = false, precision = 12, scale = 2)
    private BigDecimal baseUnitPriceCny;

    @Column(name = "discount_rate", nullable = false, updatable = false, precision = 8, scale = 4)
    private BigDecimal discountRate;

    @Column(name = "unit_price_cny", nullable = false, updatable = false, precision = 12, scale = 2)
    private BigDecimal unitPriceCny;

    @Column(name = "line_total_cny", nullable = false, updatable = false, precision = 14, scale = 2)
    private BigDecimal lineTotalCny;

    protected SupplierPriceLine() {
    }

    SupplierPriceLine(UUID supplierOrderId, UUID supplierOrderPartId, UUID supplierOrgId, UUID customerOrderPartId,
                      int quantity, BigDecimal baseUnitPriceCny, BigDecimal discountRate) {
        this.supplierOrderId = supplierOrderId;
        this.supplierOrderPartId = supplierOrderPartId;
        this.supplierOrgId = supplierOrgId;
        this.customerOrderPartId = customerOrderPartId;
        this.quantity = quantity;
        this.baseUnitPriceCny = baseUnitPriceCny;
        this.discountRate = discountRate;
        this.unitPriceCny = PriceCalculator.supplierUnitPrice(baseUnitPriceCny, discountRate);
        this.lineTotalCny = unitPriceCny.multiply(BigDecimal.valueOf(quantity));
    }

    UUID getSupplierOrderId() {
        return supplierOrderId;
    }

    UUID getSupplierOrderPartId() {
        return supplierOrderPartId;
    }

    BigDecimal getUnitPriceCny() {
        return unitPriceCny;
    }

    BigDecimal getLineTotalCny() {
        return lineTotalCny;
    }
}
