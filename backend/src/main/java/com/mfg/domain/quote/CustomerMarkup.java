package com.mfg.domain.quote;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * 客户加成率：每个客户一个数，运营填（设计文档 13 §2.1）。对客价 = 原价 × 汇率 × 本值，1.2 = 加价 20%（2026-09-17）。
 *
 * <p>放在报价域自己的表里，不往客户资料（platform/identity）加列。已发出的报价另存快照，改这里不影响它们。
 * 只读实体：写入走 {@link CustomerMarkupRepository#upsert}（并发安全）。
 */
@Entity
@Table(name = "customer_markup")
class CustomerMarkup extends BaseEntity {

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_org_id", columnDefinition = "uuid", nullable = false, updatable = false, unique = true)
    private UUID customerOrgId;

    @Column(name = "markup_rate", nullable = false, precision = 8, scale = 4)
    private BigDecimal markupRate;

    protected CustomerMarkup() {
    }

    UUID getCustomerOrgId() {
        return customerOrgId;
    }

    BigDecimal getMarkupRate() {
        return markupRate;
    }
}
