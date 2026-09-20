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
 * 供应商订单里的零件实例 —— 派生自某 {@link OpsOrderPart}(upstreamPartId),
 * 并冗余源客户订单 / 源客户(创建时快照,溯源用)。
 *
 * <p>★ <b>这里是零件链上唯一的真状态机</b>(设计文档 12 §1)。上面两层不存供应侧状态:
 * 运营页面按这些行现算,客户零件行只存折叠过的四态。
 *
 * <p>质检拆行(2026-09-20 拍板):原行留下合格件数,问题件另开一行。溯源两头都记 ——
 * 旧行 {@code supersededBy} 指向新行,新行 {@code replacesPartId} 指向旧行。
 * 原行合格 0 件时件数不动、状态改 {@code SUPERSEDED}(库里 quantity 的 CHECK 是 >= 1,减不到 0)。
 */
@Entity
@Table(name = "supplier_order_part")
class SupplierOrderPart extends BaseEntity {

    enum FulfillmentStatus {
        /** 等供应商开工 */
        PENDING,
        /** 供应商已报开工 */
        IN_PRODUCTION,
        /** 供应商已报完工,还没发给平台 */
        PRODUCED,
        /** 已发到平台,等运营质检 */
        QC_PENDING,
        /** 质检合格(终态) */
        QC_PASSED,
        /** 整行被拆走,件数落在新行上(终态) */
        SUPERSEDED,
        /** 报废(终态);没补料前它的件数仍算在客户那一批里 */
        SCRAPPED,
        /** 供应商订单取消时连带作废,本轮没有触发路径 */
        CANCELLED
    }

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "supplier_order_id", columnDefinition = "uuid", nullable = false)
    private UUID supplierOrderId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "part_design_id", columnDefinition = "uuid", nullable = false)
    private UUID partDesignId;

    @Column(name = "part_no", nullable = false)
    private String partNo;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "upstream_part_id", columnDefinition = "uuid", nullable = false)
    private UUID upstreamPartId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "source_customer_order_id", columnDefinition = "uuid", nullable = false)
    private UUID sourceCustomerOrderId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "source_customer_id", columnDefinition = "uuid", nullable = false)
    private UUID sourceCustomerId;

    /**
     * 这一行要做多少件 —— 一行零件是<b>一批</b>,不是一个物理件(设计文档 12 §1)。
     *
     * <p>质检按个数记(合格 N / 返工 N / 报废 N),不逐件建行。部分返工时从本行减去问题件数、
     * 另开一行装那几件,两行数量之和不变。
     *
     * <p>库里这一列<b>没有默认值</b>,是刻意的:忘了填会当场报错,而不是静默变成 1 ——
     * 数量要拿去算钱和排产,静默默认值是最难查的那种错。
     */
    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Enumerated(EnumType.STRING)
    @Column(name = "fulfillment_status", nullable = false)
    private FulfillmentStatus fulfillmentStatus = FulfillmentStatus.PENDING;

    /** 本行被拆走后,件数落在哪一行上(溯源正向)。 */
    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "superseded_by", columnDefinition = "uuid")
    private UUID supersededBy;

    /** 本行是从哪一行拆出来的(溯源反向);原始行为 null。 */
    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "replaces_part_id", columnDefinition = "uuid")
    private UUID replacesPartId;

    @Column(name = "started_at", columnDefinition = "timestamp with time zone")
    private Instant startedAt;

    @Column(name = "produced_at", columnDefinition = "timestamp with time zone")
    private Instant producedAt;

    @Column(name = "shipped_at", columnDefinition = "timestamp with time zone")
    private Instant shippedAt;

    @Column(name = "qc_decided_at", columnDefinition = "timestamp with time zone")
    private Instant qcDecidedAt;

    protected SupplierOrderPart() {
    }

    public SupplierOrderPart(UUID supplierOrderId, UUID partDesignId, String partNo, int quantity,
                             UUID upstreamPartId, UUID sourceCustomerOrderId, UUID sourceCustomerId) {
        this.supplierOrderId = supplierOrderId;
        this.partDesignId = partDesignId;
        this.partNo = partNo;
        this.quantity = quantity;
        this.upstreamPartId = upstreamPartId;
        this.sourceCustomerOrderId = sourceCustomerOrderId;
        this.sourceCustomerId = sourceCustomerId;
    }

    /** 从 {@code origin} 拆出 {@code quantity} 件,新行在同一张供应商订单里。 */
    static SupplierOrderPart splitFrom(SupplierOrderPart origin, int quantity, FulfillmentStatus status,
                                       Instant now) {
        SupplierOrderPart p = new SupplierOrderPart(origin.getSupplierOrderId(), origin.getPartDesignId(),
                UUID.randomUUID().toString(), quantity, origin.getUpstreamPartId(),
                origin.getSourceCustomerOrderId(), origin.getSourceCustomerId());
        p.replacesPartId = origin.getId();
        p.fulfillmentStatus = status;
        if (status == FulfillmentStatus.SCRAPPED) {
            p.qcDecidedAt = now;
        }
        return p;
    }

    void start(Instant now) {
        this.fulfillmentStatus = FulfillmentStatus.IN_PRODUCTION;
        this.startedAt = now;
    }

    void produce(Instant now) {
        this.fulfillmentStatus = FulfillmentStatus.PRODUCED;
        this.producedAt = now;
    }

    void ship(Instant now) {
        this.fulfillmentStatus = FulfillmentStatus.QC_PENDING;
        this.shippedAt = now;
    }

    /** 质检合格:本行留下 {@code passed} 件。 */
    void qcPassed(int passed, Instant now) {
        this.quantity = passed;
        this.fulfillmentStatus = FulfillmentStatus.QC_PASSED;
        this.qcDecidedAt = now;
    }

    /** 整行被拆走:件数不动(CHECK 是 >= 1),状态改成已被替代。 */
    void supersede(UUID newPartId, Instant now) {
        this.fulfillmentStatus = FulfillmentStatus.SUPERSEDED;
        this.supersededBy = newPartId;
        this.qcDecidedAt = now;
    }

    /** 报废件已补料:指向补料的新行。状态仍是 SCRAPPED —— 报废这件事不撤销。 */
    void remadeBy(UUID newPartId) {
        this.supersededBy = newPartId;
    }

    /** 还没补料的报废件:它的件数仍算在客户那一批里(数量守恒)。 */
    boolean isScrapAwaitingRemake() {
        return fulfillmentStatus == FulfillmentStatus.SCRAPPED && supersededBy == null;
    }

    /** 供应商还得干活的行。 */
    boolean isUnfinished() {
        return fulfillmentStatus == FulfillmentStatus.PENDING || fulfillmentStatus == FulfillmentStatus.IN_PRODUCTION;
    }

    public UUID getSupplierOrderId() {
        return supplierOrderId;
    }

    public UUID getPartDesignId() {
        return partDesignId;
    }

    public String getPartNo() {
        return partNo;
    }

    public UUID getUpstreamPartId() {
        return upstreamPartId;
    }

    public UUID getSourceCustomerOrderId() {
        return sourceCustomerOrderId;
    }

    public UUID getSourceCustomerId() {
        return sourceCustomerId;
    }

    public int getQuantity() {
        return quantity;
    }

    FulfillmentStatus getFulfillmentStatus() {
        return fulfillmentStatus;
    }

    UUID getSupersededBy() {
        return supersededBy;
    }

    UUID getReplacesPartId() {
        return replacesPartId;
    }

    Instant getStartedAt() {
        return startedAt;
    }

    Instant getProducedAt() {
        return producedAt;
    }

    Instant getShippedAt() {
        return shippedAt;
    }

    Instant getQcDecidedAt() {
        return qcDecidedAt;
    }
}
