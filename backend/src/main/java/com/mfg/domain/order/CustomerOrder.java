package com.mfg.domain.order;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/**
 * 客户订单 —— 一张表走到底(D17):草稿 → 提交,后续状态随第 3 步加。
 *
 * <p>客户只能取消草稿(设计文档 12 §2 已拍板)。提交之后的取消归运营,本步不做。
 * 状态的并发转换不靠这里的 setter,靠 {@link CustomerOrderRepository} 里带
 * {@code WHERE status = ...} 的条件更新 —— 两个请求同时提交,只有一个能改成功。
 */
@Entity
@Table(name = "customer_order")
class CustomerOrder extends BaseEntity {

    enum Status {
        DRAFT, SUBMITTED, CANCELLED
    }

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_org_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID customerOrgId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "created_by_user_id", columnDefinition = "uuid", updatable = false)
    private UUID createdByUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status = Status.DRAFT;

    /** 客户给订单起的名字,方便自己认。 */
    @Column(name = "title")
    private String title;

    /** 客户期望的交货天数 —— 仅参考,不是运营填的交期(那个是承诺,见设计文档 13 §2.06)。 */
    @Column(name = "wanted_lead_days")
    private Integer wantedLeadDays;

    @Column(name = "submitted_at", columnDefinition = "timestamp with time zone")
    private Instant submittedAt;

    protected CustomerOrder() {
    }

    CustomerOrder(UUID customerOrgId, UUID createdByUserId, String title, Integer wantedLeadDays) {
        this.customerOrgId = customerOrgId;
        this.createdByUserId = createdByUserId;
        this.title = title;
        this.wantedLeadDays = wantedLeadDays;
    }

    void updateDraft(String title, Integer wantedLeadDays) {
        this.title = title;
        this.wantedLeadDays = wantedLeadDays;
    }

    UUID getCustomerOrgId() {
        return customerOrgId;
    }

    UUID getCreatedByUserId() {
        return createdByUserId;
    }

    Status getStatus() {
        return status;
    }

    String getTitle() {
        return title;
    }

    Integer getWantedLeadDays() {
        return wantedLeadDays;
    }

    Instant getSubmittedAt() {
        return submittedAt;
    }
}
