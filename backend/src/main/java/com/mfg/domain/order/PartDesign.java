package com.mfg.domain.order;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

/**
 * 零件设计模板 —— "同一种零件"(规格/图纸的抽象),归属某客户(租户隔离)。
 * 各订单里的零件实例指回它。骨架只有 code + name,规格/图纸后续加。
 */
@Entity
@Table(name = "part_design")
public class PartDesign extends BaseEntity {

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_org_id", columnDefinition = "uuid", nullable = false)
    private UUID customerOrgId;

    /** 该客户内唯一的设计编码。 */
    @Column(name = "code", nullable = false)
    private String code;

    @Column(name = "name", nullable = false)
    private String name;

    protected PartDesign() {
    }

    public PartDesign(UUID customerOrgId, String code, String name) {
        this.customerOrgId = customerOrgId;
        this.code = code;
        this.name = name;
    }

    public UUID getCustomerOrgId() {
        return customerOrgId;
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }
}
