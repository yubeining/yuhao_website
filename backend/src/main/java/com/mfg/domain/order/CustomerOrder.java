package com.mfg.domain.order;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

/** 客户创建的订单。骨架:归属客户 + 下单人。状态/明细/图纸/价格后续加。无外键。 */
@Entity
@Table(name = "customer_order")
class CustomerOrder extends BaseEntity {

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_org_id", columnDefinition = "uuid", nullable = false)
    private UUID customerOrgId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "created_by_user_id", columnDefinition = "uuid")
    private UUID createdByUserId;

    protected CustomerOrder() {
    }

    public CustomerOrder(UUID customerOrgId, UUID createdByUserId) {
        this.customerOrgId = customerOrgId;
        this.createdByUserId = createdByUserId;
    }

    public UUID getCustomerOrgId() {
        return customerOrgId;
    }

    public UUID getCreatedByUserId() {
        return createdByUserId;
    }
}
