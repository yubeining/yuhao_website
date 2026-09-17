package com.mfg.platform.fx;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * 数据源某天公布的一个汇率：1 个 {@code baseCurrency} 兑多少 {@code quoteCurrency}。
 *
 * <p>只增不改（{@link Immutable}），bigserial 主键，不继承 BaseEntity。写入走
 * {@link FxRateRepository#insertIfAbsent} 的 {@code ON CONFLICT DO NOTHING}，不走 JPA 的 save。
 *
 * <p>唯一约束在这里也声明一遍：测试 profile 用 JPA 建表，没有它，重复拉取就测不出来。
 */
@Entity
@Immutable
@Table(name = "fx_rate", uniqueConstraints = @UniqueConstraint(name = "fx_rate_source_date_pair_uk",
        columnNames = {"source", "rate_date", "base_currency", "quote_currency"}))
class FxRate {

    static final String SOURCE_ECB = "ECB";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false, updatable = false)
    private Long id;

    @Column(name = "source", nullable = false, updatable = false)
    private String source;

    /** 数据源公布的日期（ECB 是 CET 日历日），不是拉取时刻。 */
    @Column(name = "rate_date", columnDefinition = "date", nullable = false, updatable = false)
    private LocalDate rateDate;

    @Column(name = "base_currency", nullable = false, updatable = false)
    private String baseCurrency;

    @Column(name = "quote_currency", nullable = false, updatable = false)
    private String quoteCurrency;

    @Column(name = "rate", precision = 18, scale = 8, nullable = false, updatable = false)
    private BigDecimal rate;

    @Column(name = "fetched_at", columnDefinition = "timestamp with time zone", nullable = false, updatable = false)
    private Instant fetchedAt;

    protected FxRate() {
    }

    String getSource() {
        return source;
    }

    LocalDate getRateDate() {
        return rateDate;
    }

    String getBaseCurrency() {
        return baseCurrency;
    }

    String getQuoteCurrency() {
        return quoteCurrency;
    }

    BigDecimal getRate() {
        return rate;
    }

    Instant getFetchedAt() {
        return fetchedAt;
    }
}
