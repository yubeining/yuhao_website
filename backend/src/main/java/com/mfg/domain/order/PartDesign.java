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
class PartDesign extends BaseEntity {

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_org_id", columnDefinition = "uuid", nullable = false)
    private UUID customerOrgId;

    /** 客户写的图号，不唯一（2026-11-26）。草稿里可以空着（2026-11-27），提交时检查。 */
    @Column(name = "code")
    private String code;

    @Column(name = "name")
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

    /** 草稿里改图号 / 名称（订单页整页编辑，2026-11-27）。每行一个零件，改它不影响别的订单。 */
    void rename(String code, String name) {
        this.code = code;
        this.name = name;
    }
}
