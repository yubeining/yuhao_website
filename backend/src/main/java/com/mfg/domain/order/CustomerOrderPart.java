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
class CustomerOrderPart extends BaseEntity {

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_order_id", columnDefinition = "uuid", nullable = false)
    private UUID customerOrderId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "part_design_id", columnDefinition = "uuid", nullable = false)
    private UUID partDesignId;

    @Column(name = "part_no", nullable = false)
    private String partNo;

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

    protected CustomerOrderPart() {
    }

    public CustomerOrderPart(UUID customerOrderId, UUID partDesignId, String partNo, int quantity) {
        this.customerOrderId = customerOrderId;
        this.partDesignId = partDesignId;
        this.partNo = partNo;
        this.quantity = quantity;
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

    public int getQuantity() {
        return quantity;
    }
}
