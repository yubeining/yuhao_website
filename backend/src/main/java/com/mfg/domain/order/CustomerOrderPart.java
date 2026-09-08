package com.mfg.domain.order;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

/**
 * 客户订单里的零件实例 —— 溯源链的根(无上游)。各有唯一编号 part_no,指回 {@link PartDesign}。
 */
@Entity
@Table(name = "customer_order_part")
public class CustomerOrderPart extends BaseEntity {

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_order_id", columnDefinition = "uuid", nullable = false)
    private UUID customerOrderId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "part_design_id", columnDefinition = "uuid", nullable = false)
    private UUID partDesignId;

    @Column(name = "part_no", nullable = false)
    private String partNo;

    protected CustomerOrderPart() {
    }

    public CustomerOrderPart(UUID customerOrderId, UUID partDesignId, String partNo) {
        this.customerOrderId = customerOrderId;
        this.partDesignId = partDesignId;
        this.partNo = partNo;
    }

    public UUID getCustomerOrderId() {
        return customerOrderId;
    }

    public UUID getPartDesignId() {
        return partDesignId;
    }

    public String getPartNo() {
        return partNo;
    }
}
