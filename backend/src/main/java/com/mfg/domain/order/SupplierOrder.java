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
 * 供应商接下的订单：接单 → 运营建合同 → 供应商签字锁定（文档 12 §4，2026-09-20 实现）。
 *
 * <p>签字前双方都能退（供应商退单 / 运营收回），生产订单回组装中重派；<b>签了就锁定</b>，退不了也改不了。
 * 接单后 7 天还没签字，定时任务自动取消（{@link SignTimeoutJob}）—— 7 天从<b>接单</b>那一刻算，不是从建合同算。
 *
 * <p>合同本轮只有几个时间戳，没有条款正文、没有 PDF（2026-09-20 需求方决定先做交互），所以不单开一张表。
 *
 * <p>同一张生产订单同时最多一张没取消的供应商订单 —— 代码里靠生产订单行锁，库里有部分唯一索引兜底。
 */
@Entity
@Table(name = "supplier_order")
class SupplierOrder extends BaseEntity {

    enum Status {
        /** 已接单，等运营建合同 */
        ACCEPTED,
        /** 合同已建，等供应商签字 */
        CONTRACT_PENDING,
        /** 已签字 = 锁定，不能退也不能改（文档 12 §4） */
        CONTRACTED,
        /** 至少一行开了工，还没全部发到平台 */
        IN_PRODUCTION,
        /** 已发到平台，等运营质检 */
        SHIPPED,
        /** 所有零件质检合格（文档 12 §4） */
        FULFILLED,
        CANCELLED
    }

    enum CancelReason {
        /** 供应商退单 */
        WITHDRAWN,
        /** 运营收回 */
        REVOKED,
        /** 接单后 7 天还没签字，系统自动取消（2026-09-20 拍板） */
        SIGN_TIMEOUT
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

    @Column(name = "contract_created_at", columnDefinition = "timestamp with time zone")
    private Instant contractCreatedAt;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "contract_created_by_user_id", columnDefinition = "uuid")
    private UUID contractCreatedByUserId;

    @Column(name = "signed_at", columnDefinition = "timestamp with time zone")
    private Instant signedAt;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "signed_by_user_id", columnDefinition = "uuid")
    private UUID signedByUserId;

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

    void createContract(UUID opsUserId, Instant now) {
        this.status = Status.CONTRACT_PENDING;
        this.contractCreatedAt = now;
        this.contractCreatedByUserId = opsUserId;
    }

    /** 作废合同：回到「已接单、等合同」，运营可以重建。签过字的不许走这条路。 */
    void cancelContract() {
        this.status = Status.ACCEPTED;
        this.contractCreatedAt = null;
        this.contractCreatedByUserId = null;
    }

    void sign(UUID supplierUserId, Instant now) {
        this.status = Status.CONTRACTED;
        this.signedAt = now;
        this.signedByUserId = supplierUserId;
    }

    /** 签过字 = 锁定。生产中 / 已发 / 已完成都在签字之后，一样退不了、收不回。 */
    boolean isSigned() {
        return status == Status.CONTRACTED || status == Status.IN_PRODUCTION || status == Status.SHIPPED
                || status == Status.FULFILLED;
    }

    /** 生产进度（{@link ProductionService} 按叶子零件行算出来后回写）。 */
    void moveTo(Status status) {
        this.status = status;
    }

    /** 还没签、也没取消：这段时间双方都能退。 */
    boolean isOpenBeforeSigning() {
        return status == Status.ACCEPTED || status == Status.CONTRACT_PENDING;
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

    Instant getContractCreatedAt() {
        return contractCreatedAt;
    }

    Instant getSignedAt() {
        return signedAt;
    }
}
