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
 * 报价的一行：对应订单里的一个零件行。图号 / 名称 / 数量是发出时的快照（CLAUDE.md §10 C2）。
 *
 * <p>{@code unitPriceCny} 是原价，<b>仅内部</b>，不给客户；{@code unitPrice} / {@code lineTotal} 是对客价，确认时才写。
 */
@Entity
@Table(name = "quote_line")
class QuoteLine extends BaseEntity {

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "quote_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID quoteId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_order_part_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID customerOrderPartId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_org_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID customerOrgId;

    @Column(name = "line_no", nullable = false, updatable = false)
    private int lineNo;

    @Column(name = "part_code", nullable = false, updatable = false)
    private String partCode;

    @Column(name = "part_name", nullable = false, updatable = false)
    private String partName;

    @Column(name = "quantity", nullable = false, updatable = false)
    private int quantity;

    @Column(name = "unit_price_cny", nullable = false, updatable = false, precision = 12, scale = 2)
    private BigDecimal unitPriceCny;

    @Column(name = "unit_price", precision = 12, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "line_total", precision = 14, scale = 2)
    private BigDecimal lineTotal;

    protected QuoteLine() {
    }

    QuoteLine(UUID quoteId, UUID customerOrderPartId, UUID customerOrgId, int lineNo, String partCode,
              String partName, int quantity, BigDecimal unitPriceCny) {
        this.quoteId = quoteId;
        this.customerOrderPartId = customerOrderPartId;
        this.customerOrgId = customerOrgId;
        this.lineNo = lineNo;
        this.partCode = partCode;
        this.partName = partName;
        this.quantity = quantity;
        this.unitPriceCny = unitPriceCny;
    }

    void lockPrice(PriceCalculator.PricedLine priced) {
        this.unitPrice = priced.unitPrice();
        this.lineTotal = priced.lineTotal();
    }

    PriceCalculator.Line toCalculatorLine() {
        return new PriceCalculator.Line(unitPriceCny, quantity);
    }

    /** 确认时锁下的对客价。未确认时为 null。 */
    PriceCalculator.PricedLine lockedPrice() {
        return unitPrice == null ? null : new PriceCalculator.PricedLine(unitPrice, lineTotal);
    }

    UUID getQuoteId() {
        return quoteId;
    }

    UUID getCustomerOrderPartId() {
        return customerOrderPartId;
    }

    String getPartCode() {
        return partCode;
    }

    String getPartName() {
        return partName;
    }

    int getQuantity() {
        return quantity;
    }

    BigDecimal getUnitPriceCny() {
        return unitPriceCny;
    }
}
