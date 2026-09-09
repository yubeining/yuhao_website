package com.mfg.domain.order;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

/**
 * 供应商订单里的零件实例 —— 派生自某 {@link OpsOrderPart}(upstreamPartId),
 * 并冗余源客户订单 / 源客户(创建时快照,溯源用)。
 */
@Entity
@Table(name = "supplier_order_part")
class SupplierOrderPart extends BaseEntity {

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

    protected SupplierOrderPart() {
    }

    public SupplierOrderPart(UUID supplierOrderId, UUID partDesignId, String partNo,
                             UUID upstreamPartId, UUID sourceCustomerOrderId, UUID sourceCustomerId) {
        this.supplierOrderId = supplierOrderId;
        this.partDesignId = partDesignId;
        this.partNo = partNo;
        this.upstreamPartId = upstreamPartId;
        this.sourceCustomerOrderId = sourceCustomerOrderId;
        this.sourceCustomerId = sourceCustomerId;
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
}
