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
 * 生产订单（运营把客户零件组起来派给供应商的那张单）。和客户 / 供应商订单不直连，靠零件派生链关联。无外键。
 *
 * <p>状态（文档 12 §3，本轮做到接单为止）：组装中 → 定向派出 / 挂全市场 → 已被接下；
 * 收回、全部拒接、供应商退单、运营收回供应商 → 回组装中。整单交给一家（ops_order : 有效 supplier_order = 1 : 1）。
 *
 * <p>每派一次 {@code dispatchRound} 加 1；定向记录按轮次记，收回后再派是新的一轮。
 * 并发：所有改状态的操作都先 {@code FOR UPDATE} 锁这一行（{@link OpsOrderRepository#lockById}），在锁里判状态再改。
 */
@Entity
@Table(name = "ops_order")
class OpsOrder extends BaseEntity {

    enum Status {
        ASSEMBLING, OFFERED, PUBLISHED, ASSIGNED,
        /** 供应商订单的零件全部质检合格（文档 12 §3） */
        FULFILLED
    }

    enum DispatchMode {
        /** 定向派给选定的几家，先到先得 */
        TARGETED,
        /** 挂全市场：所有可派单的供应商都看得到，先到先得 */
        MARKET
    }

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "created_by_user_id", columnDefinition = "uuid")
    private UUID createdByUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status = Status.ASSEMBLING;

    @Enumerated(EnumType.STRING)
    @Column(name = "dispatch_mode")
    private DispatchMode dispatchMode;

    @Column(name = "dispatch_round", nullable = false)
    private int dispatchRound;

    /** 对供交期：运营每次派单时手填（2026-09-18 拍板）。 */
    @Column(name = "supplier_due_date")
    private LocalDate supplierDueDate;

    @Column(name = "dispatched_at", columnDefinition = "timestamp with time zone")
    private Instant dispatchedAt;

    protected OpsOrder() {
    }

    OpsOrder(UUID createdByUserId) {
        this.createdByUserId = createdByUserId;
    }

    /** 开新一轮派单（定向或挂市场）。调用方已在行锁里判过是组装中。 */
    void dispatch(DispatchMode mode, LocalDate dueDate, Instant now) {
        this.dispatchRound++;
        this.dispatchMode = mode;
        this.supplierDueDate = dueDate;
        this.dispatchedAt = now;
        this.status = mode == DispatchMode.TARGETED ? Status.OFFERED : Status.PUBLISHED;
    }

    void assign() {
        this.status = Status.ASSIGNED;
    }

    /** 零件全部质检合格 / 有行又回到在做（{@link ProductionService} 按叶子零件行算完回写）。 */
    void moveTo(Status status) {
        this.status = status;
    }

    /** 收回 / 全部拒接 / 供应商退单 / 运营收回供应商：回组装中。上一轮的派法、交期留着备查。 */
    void backToAssembling() {
        this.status = Status.ASSEMBLING;
    }

    boolean isOpen() {
        return status == Status.OFFERED || status == Status.PUBLISHED;
    }

    Status getStatus() {
        return status;
    }

    DispatchMode getDispatchMode() {
        return dispatchMode;
    }

    int getDispatchRound() {
        return dispatchRound;
    }

    LocalDate getSupplierDueDate() {
        return supplierDueDate;
    }

    Instant getDispatchedAt() {
        return dispatchedAt;
    }
}
