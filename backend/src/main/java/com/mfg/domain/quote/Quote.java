package com.mfg.domain.quote;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * 一次对客报价（同一张订单每重报一次一行，{@code versionNo} 从 1 起）。
 *
 * <p>状态：{@code SENT} 当前有效，客户可确认 / 拒绝；运营重报后旧的变 {@code SUPERSEDED}；
 * 客户拒绝 → {@code REJECTED}；客户确认 → {@code CONFIRMED}。不设有效期（2026-09-17）。
 *
 * <p>★ 汇率在客户确认那一刻才锁（设计文档 13 §3.1）：{@code SENT} 时不存对客价，每次查看按最新 ECB 汇率现算；
 * 确认时把汇率和总计写进来，此后只读快照（CLAUDE.md §10 C2）。加成率在发出时就快照。
 *
 * <p>状态的并发由订单行锁保证（报价 / 确认 / 拒绝都先锁订单），库里另有「每单最多一条 SENT / CONFIRMED」的唯一索引兜底。
 */
@Entity
@Table(name = "quote")
class Quote extends BaseEntity {

    enum Status {
        SENT, SUPERSEDED, REJECTED, CONFIRMED
    }

    /** 可选的对客币种（2026-09-17 拍板）。 */
    enum Currency {
        EUR, USD, GBP, CNY
    }

    static final String FX_SOURCE_ECB = "ECB";

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_order_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID customerOrderId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_org_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID customerOrgId;

    @Column(name = "version_no", nullable = false, updatable = false)
    private int versionNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status = Status.SENT;

    @Enumerated(EnumType.STRING)
    @Column(name = "currency", nullable = false, updatable = false)
    private Currency currency;

    /** 交期：客户确认后多少天（运营填，整单一个）。 */
    @Column(name = "lead_days", nullable = false, updatable = false)
    private int leadDays;

    @Column(name = "markup_rate", nullable = false, updatable = false, precision = 8, scale = 4)
    private BigDecimal markupRate;

    @Column(name = "sent_at", columnDefinition = "timestamp with time zone", nullable = false, updatable = false)
    private Instant sentAt;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "sent_by_user_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID sentByUserId;

    @Column(name = "confirmed_at", columnDefinition = "timestamp with time zone")
    private Instant confirmedAt;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "confirmed_by_user_id", columnDefinition = "uuid")
    private UUID confirmedByUserId;

    @Column(name = "rejected_at", columnDefinition = "timestamp with time zone")
    private Instant rejectedAt;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "rejected_by_user_id", columnDefinition = "uuid")
    private UUID rejectedByUserId;

    @Column(name = "fx_source")
    private String fxSource;

    @Column(name = "fx_rate_date")
    private LocalDate fxRateDate;

    @Column(name = "fx_eur_cny", precision = 18, scale = 8)
    private BigDecimal fxEurCny;

    @Column(name = "fx_eur_quote", precision = 18, scale = 8)
    private BigDecimal fxEurQuote;

    @Column(name = "total_amount", precision = 14, scale = 2)
    private BigDecimal totalAmount;

    protected Quote() {
    }

    Quote(UUID customerOrderId, UUID customerOrgId, int versionNo, Currency currency, int leadDays,
          BigDecimal markupRate, UUID sentByUserId, Instant sentAt) {
        this.customerOrderId = customerOrderId;
        this.customerOrgId = customerOrgId;
        this.versionNo = versionNo;
        this.currency = currency;
        this.leadDays = leadDays;
        this.markupRate = markupRate;
        this.sentByUserId = sentByUserId;
        this.sentAt = sentAt;
    }

    void supersede() {
        this.status = Status.SUPERSEDED;
    }

    void reject(UUID userId, Instant now) {
        this.status = Status.REJECTED;
        this.rejectedByUserId = userId;
        this.rejectedAt = now;
    }

    void confirm(UUID userId, Instant now, LocalDate rateDate, PriceCalculator.Rates rates, BigDecimal total) {
        this.status = Status.CONFIRMED;
        this.confirmedByUserId = userId;
        this.confirmedAt = now;
        this.fxSource = FX_SOURCE_ECB;
        this.fxRateDate = rateDate;
        this.fxEurCny = rates.eurCny();
        this.fxEurQuote = rates.eurQuote();
        this.totalAmount = total;
    }

    /** 确认时锁下的汇率。未确认时为 null。 */
    PriceCalculator.Rates lockedRates() {
        return fxEurCny == null ? null : new PriceCalculator.Rates(fxEurCny, fxEurQuote);
    }

    UUID getCustomerOrderId() {
        return customerOrderId;
    }

    UUID getCustomerOrgId() {
        return customerOrgId;
    }

    int getVersionNo() {
        return versionNo;
    }

    Status getStatus() {
        return status;
    }

    Currency getCurrency() {
        return currency;
    }

    int getLeadDays() {
        return leadDays;
    }

    BigDecimal getMarkupRate() {
        return markupRate;
    }

    Instant getSentAt() {
        return sentAt;
    }

    Instant getConfirmedAt() {
        return confirmedAt;
    }

    Instant getRejectedAt() {
        return rejectedAt;
    }

    LocalDate getFxRateDate() {
        return fxRateDate;
    }

    BigDecimal getTotalAmount() {
        return totalAmount;
    }
}
