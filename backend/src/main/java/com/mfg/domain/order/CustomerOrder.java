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
import java.time.LocalDate;
import java.util.UUID;

/**
 * 客户订单 —— 一张表走到底(D17):草稿 → 提交 → 已报价 → 已确认(第 3 步),后续状态随派单加。
 *
 * <p>客户只能取消草稿(设计文档 12 §2 已拍板)。提交之后的取消归运营,本步不做。
 * 状态的并发转换不靠这里的 setter,靠 {@link CustomerOrderRepository} 里带
 * {@code WHERE status = ...} 的条件更新 —— 两个请求同时提交,只有一个能改成功。
 */
@Entity
@Table(name = "customer_order")
class CustomerOrder extends BaseEntity {

    enum Status {
        DRAFT, SUBMITTED, QUOTED, CONFIRMED,
        /** 零件全部质检合格，等发给客户（文档 12 §2） */
        READY,
        /** 运营整单发给客户（2026-11-24），承运商 + 运单号必填 */
        SHIPPED,
        /** 客户确认收货 */
        COMPLETED,
        CANCELLED
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

    /**
     * 客户期望的交货日期 —— 仅参考,不是运营承诺的交期（那个在报价里填,见设计文档 13 §2.06）。
     *
     * <p>2026-11-15 从「天数」改成「日期」：客户想的是"哪天要",不是"几天后"。
     * 旧列 wanted_lead_days 留在库里没删，回滚那一版 jar 时仍能写。
     */
    @Column(name = "wanted_date")
    private LocalDate wantedDate;

    @Column(name = "submitted_at", columnDefinition = "timestamp with time zone")
    private Instant submittedAt;

    // ---------- 收货地址（2026-11-23）：提交时必填，READY 之前客户能改。必填项由 service 校验，列全部可空 ----------

    /** ISO 3166-1 两位国家代码。为 null 表示还没填过地址（保存时必填项是一起校验的）。 */
    @Column(name = "ship_to_country")
    private String shipToCountry;

    @Column(name = "ship_to_company")
    private String shipToCompany;

    @Column(name = "ship_to_contact")
    private String shipToContact;

    @Column(name = "ship_to_phone")
    private String shipToPhone;

    @Column(name = "ship_to_line1")
    private String shipToLine1;

    @Column(name = "ship_to_line2")
    private String shipToLine2;

    @Column(name = "ship_to_city")
    private String shipToCity;

    @Column(name = "ship_to_region")
    private String shipToRegion;

    @Column(name = "ship_to_postal_code")
    private String shipToPostalCode;

    // ---------- 发货（2026-11-24）：整单只发一次，所以直接放在订单上。由仓库的条件更新写入，这里只读 ----------

    @Column(name = "shipment_carrier")
    private String shipmentCarrier;

    @Column(name = "shipment_tracking_no")
    private String shipmentTrackingNo;

    @Column(name = "shipped_at", columnDefinition = "timestamp with time zone")
    private Instant shippedAt;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "shipped_by_ops_user_id", columnDefinition = "uuid")
    private UUID shippedByOpsUserId;

    @Column(name = "received_at", columnDefinition = "timestamp with time zone")
    private Instant receivedAt;

    protected CustomerOrder() {
    }

    CustomerOrder(UUID customerOrgId, UUID createdByUserId, String title, LocalDate wantedDate) {
        this.customerOrgId = customerOrgId;
        this.createdByUserId = createdByUserId;
        this.title = title;
        this.wantedDate = wantedDate;
    }

    void updateDraft(String title, LocalDate wantedDate) {
        this.title = title;
        this.wantedDate = wantedDate;
    }

    /** 整体替换，没带的选填项清空。 */
    void replaceShipTo(ShipTo a) {
        this.shipToCountry = a.country();
        this.shipToCompany = a.company();
        this.shipToContact = a.contact();
        this.shipToPhone = a.phone();
        this.shipToLine1 = a.line1();
        this.shipToLine2 = a.line2();
        this.shipToCity = a.city();
        this.shipToRegion = a.region();
        this.shipToPostalCode = a.postalCode();
    }

    /** 没填过地址返回 null。 */
    ShipTo getShipTo() {
        if (shipToCountry == null) {
            return null;
        }
        return new ShipTo(shipToCountry, shipToCompany, shipToContact, shipToPhone, shipToLine1, shipToLine2,
                shipToCity, shipToRegion, shipToPostalCode);
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

    LocalDate getWantedDate() {
        return wantedDate;
    }

    Instant getSubmittedAt() {
        return submittedAt;
    }

    /** 没发货返回 null。发货人不对外，不在视图里。 */
    OrderShipment getShipment() {
        if (shippedAt == null) {
            return null;
        }
        return new OrderShipment(shipmentCarrier, shipmentTrackingNo, shippedAt, receivedAt);
    }
}
