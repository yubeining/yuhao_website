package com.mfg.domain.quote;

import com.mfg.common.exception.BusinessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * 费率表维护（运营端）。费率是平台自己的数据，不属于任何客户，所以没有租户条件。
 *
 * <p>材料只能按 kg 计价：成本算法里材料 = 毛坯重 × 单价（手册 2.2）。同类别下名称唯一 ——
 * AI 按名称挑费率，重名就不知道该用哪条。
 */
@Service
class CostRateService {

    private final CostRateRepository rates;

    CostRateService(CostRateRepository rates) {
        this.rates = rates;
    }

    record Input(CostRate.Kind kind, String name, CostRate.Unit unit, BigDecimal unitPriceCny, String note) {
    }

    @Transactional(readOnly = true)
    public List<CostRateView> list() {
        return rates.findAllByOrderByKindAscNameAsc().stream().map(CostRate::view).toList();
    }

    @Transactional(readOnly = true)
    List<CostRateSnapshot> snapshot() {
        return rates.findAllByOrderByKindAscNameAsc().stream().map(CostRate::snapshot).toList();
    }

    @Transactional
    public CostRateView create(Input in) {
        Input clean = validate(in);
        rejectDuplicate(clean, null);
        return save(new CostRate(clean.kind(), clean.name(), clean.unit(), clean.unitPriceCny(), clean.note()));
    }

    @Transactional
    public CostRateView update(UUID id, Input in) {
        Input clean = validate(in);
        CostRate rate = rates.findById(id).orElseThrow(() -> BusinessException.notFound("cost_rate.not_found"));
        rejectDuplicate(clean, id);
        rate.apply(clean.kind(), clean.name(), clean.unit(), clean.unitPriceCny(), clean.note());
        return save(rate);
    }

    @Transactional
    public void delete(UUID id) {
        CostRate rate = rates.findById(id).orElseThrow(() -> BusinessException.notFound("cost_rate.not_found"));
        rates.delete(rate);
    }

    private static Input validate(Input in) {
        if (in.kind() == CostRate.Kind.MATERIAL && in.unit() != CostRate.Unit.KG) {
            throw BusinessException.badRequest("cost_rate.material_needs_kg");
        }
        String note = in.note() == null || in.note().isBlank() ? null : in.note().strip();
        return new Input(in.kind(), in.name().strip(), in.unit(), in.unitPriceCny(), note);
    }

    private void rejectDuplicate(Input in, UUID self) {
        rates.findByKindAndName(in.kind(), in.name())
                .filter(existing -> !existing.getId().equals(self))
                .ifPresent(existing -> {
                    throw BusinessException.conflict("cost_rate.duplicate");
                });
    }

    /** 并发下两个人同时建同名的：唯一索引兜底，翻成同一个 409。 */
    private CostRateView save(CostRate rate) {
        try {
            return rates.saveAndFlush(rate).view();
        } catch (DataIntegrityViolationException e) {
            throw BusinessException.conflict("cost_rate.duplicate");
        }
    }
}
