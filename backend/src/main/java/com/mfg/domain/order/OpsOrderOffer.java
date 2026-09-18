package com.mfg.domain.order;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/**
 * 定向派单：某一轮派给了哪一家。拒接只把这一家标成 DECLINED，其余照常可接（2026-09-18 拍板）；
 * 运营收回时这一轮还开着的全部标成 REVOKED。挂全市场不建这张表的记录。
 */
@Entity
@Table(name = "ops_order_offer")
class OpsOrderOffer extends BaseEntity {

    enum Status {
        OFFERED, DECLINED, REVOKED
    }

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "ops_order_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID opsOrderId;

    @Column(name = "dispatch_round", nullable = false, updatable = false)
    private int dispatchRound;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "supplier_org_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID supplierOrgId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status = Status.OFFERED;

    @Column(name = "responded_at", columnDefinition = "timestamp with time zone")
    private Instant respondedAt;

    protected OpsOrderOffer() {
    }

    OpsOrderOffer(UUID opsOrderId, int dispatchRound, UUID supplierOrgId) {
        this.opsOrderId = opsOrderId;
        this.dispatchRound = dispatchRound;
        this.supplierOrgId = supplierOrgId;
    }

    void decline(Instant now) {
        this.status = Status.DECLINED;
        this.respondedAt = now;
    }

    void revoke() {
        this.status = Status.REVOKED;
    }

    UUID getOpsOrderId() {
        return opsOrderId;
    }

    int getDispatchRound() {
        return dispatchRound;
    }

    UUID getSupplierOrgId() {
        return supplierOrgId;
    }

    Status getStatus() {
        return status;
    }

    Instant getRespondedAt() {
        return respondedAt;
    }
}
