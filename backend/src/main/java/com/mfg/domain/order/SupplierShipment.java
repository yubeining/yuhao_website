package com.mfg.domain.order;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/**
 * 供应商发给平台的一批货（2026-11-24 拍板：承运商 + 运单号必填）。
 *
 * <p>一张供应商订单可能发不止一次：返工 / 重做的行修好后再点一次「发给平台」，发的就是那几行。
 * 所以单号不放在供应商订单上，每发一次记一条；零件行用 {@code supplier_shipment_id} 记自己是哪一批发出的。
 * 只增不改。
 */
@Entity
@Table(name = "supplier_shipment")
class SupplierShipment extends BaseEntity {

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "supplier_order_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID supplierOrderId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "supplier_org_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID supplierOrgId;

    @Column(name = "carrier", nullable = false, updatable = false)
    private String carrier;

    @Column(name = "tracking_no", nullable = false, updatable = false)
    private String trackingNo;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "shipped_by_user_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID shippedByUserId;

    @Column(name = "shipped_at", columnDefinition = "timestamp with time zone", nullable = false, updatable = false)
    private Instant shippedAt;

    protected SupplierShipment() {
    }

    SupplierShipment(UUID supplierOrderId, UUID supplierOrgId, String carrier, String trackingNo,
                     UUID shippedByUserId, Instant shippedAt) {
        this.supplierOrderId = supplierOrderId;
        this.supplierOrgId = supplierOrgId;
        this.carrier = carrier;
        this.trackingNo = trackingNo;
        this.shippedByUserId = shippedByUserId;
        this.shippedAt = shippedAt;
    }

    UUID getSupplierOrderId() {
        return supplierOrderId;
    }

    String getCarrier() {
        return carrier;
    }

    String getTrackingNo() {
        return trackingNo;
    }

    Instant getShippedAt() {
        return shippedAt;
    }
}
