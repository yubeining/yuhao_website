package com.mfg.domain.order;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

/** 运营"组装"出来的订单。和客户/供应商订单不直连,靠零件派生链关联。无外键。 */
@Entity
@Table(name = "ops_order")
public class OpsOrder extends BaseEntity {

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "created_by_user_id", columnDefinition = "uuid")
    private UUID createdByUserId;

    protected OpsOrder() {
    }

    public OpsOrder(UUID createdByUserId) {
        this.createdByUserId = createdByUserId;
    }

    public UUID getCreatedByUserId() {
        return createdByUserId;
    }
}
