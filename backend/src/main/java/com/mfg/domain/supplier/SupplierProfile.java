package com.mfg.domain.supplier;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * 供应商资料：运营录的折率和能力（2026-09-18 需求方拍板，设计文档 11 / 13 §2.2）。
 *
 * <p>折率：对供价 = 原价 × 本值，填 0.8 = 乘 0.8；为空 = 还没录，这家不能被派单。
 * 能力（工艺 / 材料 / 尺寸范围 / 精度等级）是自由文本，派单时列给运营看，系统不判断匹配。
 *
 * <p>只读实体：写入走 {@link SupplierProfileRepository} 的两条 upsert（折率、能力各一条，互不覆盖）。
 */
@Entity
@Table(name = "supplier_profile")
class SupplierProfile extends BaseEntity {

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "supplier_org_id", columnDefinition = "uuid", nullable = false, updatable = false, unique = true)
    private UUID supplierOrgId;

    @Column(name = "discount_rate", precision = 8, scale = 4)
    private BigDecimal discountRate;

    @Column(name = "processes")
    private String processes;

    @Column(name = "materials")
    private String materials;

    @Column(name = "size_range")
    private String sizeRange;

    @Column(name = "precision_grade")
    private String precisionGrade;

    protected SupplierProfile() {
    }

    UUID getSupplierOrgId() {
        return supplierOrgId;
    }

    BigDecimal getDiscountRate() {
        return discountRate;
    }

    String getProcesses() {
        return processes;
    }

    String getMaterials() {
        return materials;
    }

    String getSizeRange() {
        return sizeRange;
    }

    String getPrecisionGrade() {
        return precisionGrade;
    }
}
