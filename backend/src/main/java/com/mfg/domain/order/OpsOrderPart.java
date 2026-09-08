package com.mfg.domain.order;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

/**
 * 运营订单里的零件实例 —— 派生自某 {@link CustomerOrderPart}(upstreamPartId),
 * 并冗余源客户订单 / 源客户(创建时快照,溯源用)。
 */
@Entity
@Table(name = "ops_order_part")
public class OpsOrderPart extends BaseEntity {

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "ops_order_id", columnDefinition = "uuid", nullable = false)
    private UUID opsOrderId;

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

    protected OpsOrderPart() {
    }

    public OpsOrderPart(UUID opsOrderId, UUID partDesignId, String partNo,
                        UUID upstreamPartId, UUID sourceCustomerOrderId, UUID sourceCustomerId) {
        this.opsOrderId = opsOrderId;
        this.partDesignId = partDesignId;
        this.partNo = partNo;
        this.upstreamPartId = upstreamPartId;
        this.sourceCustomerOrderId = sourceCustomerOrderId;
        this.sourceCustomerId = sourceCustomerId;
    }

    public UUID getOpsOrderId() {
        return opsOrderId;
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
