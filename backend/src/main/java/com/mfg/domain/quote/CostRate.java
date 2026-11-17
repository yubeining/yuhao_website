package com.mfg.domain.quote;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/**
 * 费率表的一条：材料 ¥/kg、工序 ¥/h 或 ¥/件、外协 ¥/件 / ¥/kg / ¥/批。运营在后台维护。
 * 初始值来自《报价逻辑与方法手册》2026-11-15 第二章（迁移 2026-11-17_01）。
 *
 * <p>估算时整表快照进 {@code price_estimate}，改这里不影响已有的估算（CLAUDE.md §10 C2）。
 */
@Entity
@Table(name = "cost_rate")
class CostRate extends BaseEntity {

    enum Kind { MATERIAL, PROCESS, OUTSOURCE }

    enum Unit { KG, HOUR, PIECE, BATCH }

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false)
    private Kind kind;

    @Column(name = "name", nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "unit", nullable = false)
    private Unit unit;

    @Column(name = "unit_price_cny", nullable = false, precision = 12, scale = 2)
    private BigDecimal unitPriceCny;

    @Column(name = "note")
    private String note;

    protected CostRate() {
    }

    CostRate(Kind kind, String name, Unit unit, BigDecimal unitPriceCny, String note) {
        apply(kind, name, unit, unitPriceCny, note);
    }

    void apply(Kind kind, String name, Unit unit, BigDecimal unitPriceCny, String note) {
        this.kind = kind;
        this.name = name;
        this.unit = unit;
        this.unitPriceCny = unitPriceCny;
        this.note = note;
    }

    CostRateSnapshot snapshot() {
        return new CostRateSnapshot(kind.name(), name, unit.name(), unitPriceCny);
    }

    CostRateView view() {
        return new CostRateView(getId(), kind.name(), name, unit.name(), unitPriceCny, note, getUpdatedAt());
    }

    Kind getKind() {
        return kind;
    }

    String getName() {
        return name;
    }
}
