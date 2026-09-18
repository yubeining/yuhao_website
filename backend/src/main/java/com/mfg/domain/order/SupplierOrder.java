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
import java.time.LocalDate;
import java.util.UUID;

/**
 * 供应商接下的订单。接单那一刻从生产订单生成（零件一并派生），本轮只有「已接」和「已取消」两个状态；
 * 合同 / 签字放下一轮（2026-09-18）。签字前供应商可退单、运营可收回（文档 12 §4），都是取消这一张，
 * 生产订单回组装中；再派再接生成新的一张，旧的留作记录。
 *
 * <p>同一张生产订单同时最多一张 ACCEPTED —— 代码里靠生产订单行锁，库里有部分唯一索引兜底。
 */
@Entity
@Table(name = "supplier_order")
class SupplierOrder extends BaseEntity {

    enum Status {
        ACCEPTED, CANCELLED
    }

    enum CancelReason {
        /** 供应商退单 */
        WITHDRAWN,
        /** 运营收回 */
        REVOKED
    }

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "supplier_org_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID supplierOrgId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "accepted_by_user_id", columnDefinition = "uuid", updatable = false)
    private UUID acceptedByUserId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "ops_order_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID opsOrderId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status = Status.ACCEPTED;

    /** 接单时的对供交期快照。 */
    @Column(name = "supplier_due_date", nullable = false, updatable = false)
    private LocalDate supplierDueDate;

    @Column(name = "accepted_at", columnDefinition = "timestamp with time zone", nullable = false, updatable = false)
    private Instant acceptedAt;

    @Column(name = "cancelled_at", columnDefinition = "timestamp with time zone")
    private Instant cancelledAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "cancel_reason")
    private CancelReason cancelReason;

    protected SupplierOrder() {
    }

    SupplierOrder(UUID supplierOrgId, UUID acceptedByUserId, UUID opsOrderId, LocalDate supplierDueDate,
                  Instant acceptedAt) {
        this.supplierOrgId = supplierOrgId;
        this.acceptedByUserId = acceptedByUserId;
        this.opsOrderId = opsOrderId;
        this.supplierDueDate = supplierDueDate;
        this.acceptedAt = acceptedAt;
    }

    void cancel(CancelReason reason, Instant now) {
        this.status = Status.CANCELLED;
        this.cancelReason = reason;
        this.cancelledAt = now;
    }

    UUID getSupplierOrgId() {
        return supplierOrgId;
    }

    UUID getOpsOrderId() {
        return opsOrderId;
    }

    Status getStatus() {
        return status;
    }

    LocalDate getSupplierDueDate() {
        return supplierDueDate;
    }

    Instant getAcceptedAt() {
        return acceptedAt;
    }

    Instant getCancelledAt() {
        return cancelledAt;
    }

    CancelReason getCancelReason() {
        return cancelReason;
    }
}
