package com.mfg.domain.quote;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * 一次 AI 成本估算（基准价，设计文档 8 / 13 §2）。只插不改：每点一次「AI 估价」留一行，界面显示最新一行。
 *
 * <p>当时的输入（订单行字段、读了哪些图、整张费率表）、AI 原始输出、算出的明细全部快照（CLAUDE.md §10 C2）。
 * 只是给运营的参考，<b>不参与任何对客定价</b> —— 原价仍由运营填（需求方 2026-11-17）。
 */
@Entity
@Table(name = "price_estimate")
class PriceEstimate extends BaseEntity {

    enum Outcome {
        /** 机加件，已算出成本（可能不完整，见 complete） */
        ESTIMATED,
        /** AI 判断不是机加件，第一版不估，转人工 */
        NOT_MACHINED
    }

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_order_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID customerOrderId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_order_part_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID customerOrderPartId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_org_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID customerOrgId;

    @Enumerated(EnumType.STRING)
    @Column(name = "outcome", nullable = false, updatable = false)
    private Outcome outcome;

    @Column(name = "unit_cost_cny", precision = 12, scale = 2, updatable = false)
    private BigDecimal unitCostCny;

    @Column(name = "complete", nullable = false, updatable = false)
    private boolean complete;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "input_snapshot", columnDefinition = "jsonb", nullable = false, updatable = false)
    private JsonNode inputSnapshot;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "ai_output", columnDefinition = "jsonb", nullable = false, updatable = false)
    private JsonNode aiOutput;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "breakdown", columnDefinition = "jsonb", nullable = false, updatable = false)
    private JsonNode breakdown;

    @Column(name = "model", nullable = false, updatable = false)
    private String model;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "estimated_by", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID estimatedBy;

    protected PriceEstimate() {
    }

    PriceEstimate(UUID customerOrderId, UUID customerOrderPartId, UUID customerOrgId, Outcome outcome,
                  BigDecimal unitCostCny, boolean complete, JsonNode inputSnapshot, JsonNode aiOutput,
                  JsonNode breakdown, String model, UUID estimatedBy) {
        this.customerOrderId = customerOrderId;
        this.customerOrderPartId = customerOrderPartId;
        this.customerOrgId = customerOrgId;
        this.outcome = outcome;
        this.unitCostCny = unitCostCny;
        this.complete = complete;
        this.inputSnapshot = inputSnapshot;
        this.aiOutput = aiOutput;
        this.breakdown = breakdown;
        this.model = model;
        this.estimatedBy = estimatedBy;
    }

    UUID getCustomerOrderPartId() {
        return customerOrderPartId;
    }

    Outcome getOutcome() {
        return outcome;
    }

    BigDecimal getUnitCostCny() {
        return unitCostCny;
    }

    boolean isComplete() {
        return complete;
    }

    JsonNode getInputSnapshot() {
        return inputSnapshot;
    }

    JsonNode getAiOutput() {
        return aiOutput;
    }

    JsonNode getBreakdown() {
        return breakdown;
    }

    String getModel() {
        return model;
    }
}
