package com.mfg.domain.order;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

/** 供应商接的订单。骨架:归属供应商 + 接单人。无外键。 */
@Entity
@Table(name = "supplier_order")
class SupplierOrder extends BaseEntity {

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "supplier_org_id", columnDefinition = "uuid", nullable = false)
    private UUID supplierOrgId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "accepted_by_user_id", columnDefinition = "uuid")
    private UUID acceptedByUserId;

    protected SupplierOrder() {
    }

    public SupplierOrder(UUID supplierOrgId, UUID acceptedByUserId) {
        this.supplierOrgId = supplierOrgId;
        this.acceptedByUserId = acceptedByUserId;
    }

    public UUID getSupplierOrgId() {
        return supplierOrgId;
    }

    public UUID getAcceptedByUserId() {
        return acceptedByUserId;
    }
}
