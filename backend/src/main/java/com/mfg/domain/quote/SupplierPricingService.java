package com.mfg.domain.quote;

import com.mfg.common.exception.BusinessException;
import com.mfg.domain.order.DispatchLine;
import com.mfg.domain.order.OrderDispatching;
import com.mfg.domain.order.SupplierOrderAccepted;
import com.mfg.domain.supplier.DispatchableSupplier;
import com.mfg.domain.supplier.SupplierDirectory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 对供价 = 原价 × 该供应商折率（文档 13 §2.2，2026-09-18 拍板）。原价取客户确认的那一版报价上的行；折率取供应商域。
 *
 * <p>接单之前各家看到的是按当前折率现算的价；接单那一刻（{@link SupplierOrderAccepted}，同一事务）写快照，此后只读快照。
 */
@Service
class SupplierPricingService {

    private final QuoteLineRepository quoteLines;
    private final SupplierPriceLineRepository snapshots;
    private final OrderDispatching dispatching;
    private final SupplierDirectory suppliers;

    SupplierPricingService(QuoteLineRepository quoteLines, SupplierPriceLineRepository snapshots,
                           OrderDispatching dispatching, SupplierDirectory suppliers) {
        this.quoteLines = quoteLines;
        this.snapshots = snapshots;
        this.dispatching = dispatching;
        this.suppliers = suppliers;
    }

    /** 运营：这张生产订单派给每一家可派单供应商各是多少钱。 */
    @Transactional(readOnly = true)
    public List<SupplierPriceViews.OpsSupplierPrice> opsPrices(UUID opsOrderId) {
        List<DispatchLine> lines = dispatching.opsOrderLines(opsOrderId);
        Map<UUID, BigDecimal> base = basePrices(lines.stream().map(DispatchLine::customerOrderPartId).toList());
        List<SupplierPriceViews.OpsSupplierPrice> result = new ArrayList<>();
        for (DispatchableSupplier s : suppliers.dispatchable()) {
            List<SupplierPriceViews.OpsLinePrice> priced = lines.stream().map(l -> {
                BigDecimal b = base.get(l.customerOrderPartId());
                BigDecimal unit = PriceCalculator.supplierUnitPrice(b, s.discountRate());
                return new SupplierPriceViews.OpsLinePrice(l.opsOrderLineId(), l.quantity(), b, unit,
                        unit.multiply(BigDecimal.valueOf(l.quantity())));
            }).toList();
            result.add(new SupplierPriceViews.OpsSupplierPrice(s.orgId(), s.name(), s.discountRate(),
                    sum(priced.stream().map(SupplierPriceViews.OpsLinePrice::lineTotalCny).toList()), priced));
        }
        return result;
    }

    /** 供应商：派给我的这些单按我的折率各是多少钱。看不到的单、我没有折率 → 不在结果里。 */
    @Transactional(readOnly = true)
    public List<SupplierPriceViews.OfferPrice> offerPrices(UUID supplierOrgId, Collection<UUID> opsOrderIds) {
        Optional<BigDecimal> discount = suppliers.discountOf(supplierOrgId);
        if (discount.isEmpty() || opsOrderIds.isEmpty()) {
            return List.of();
        }
        List<DispatchLine> lines = dispatching.openLinesFor(supplierOrgId, opsOrderIds);
        Map<UUID, BigDecimal> base = basePrices(lines.stream().map(DispatchLine::customerOrderPartId).toList());
        Map<UUID, List<SupplierPriceViews.LinePrice>> byOrder = new LinkedHashMap<>();
        for (DispatchLine l : lines) {
            BigDecimal unit = PriceCalculator.supplierUnitPrice(base.get(l.customerOrderPartId()), discount.get());
            byOrder.computeIfAbsent(l.opsOrderId(), k -> new ArrayList<>()).add(new SupplierPriceViews.LinePrice(
                    l.opsOrderLineId(), unit, unit.multiply(BigDecimal.valueOf(l.quantity()))));
        }
        return byOrder.entrySet().stream().map(e -> new SupplierPriceViews.OfferPrice(e.getKey(),
                sum(e.getValue().stream().map(SupplierPriceViews.LinePrice::lineTotalCny).toList()), e.getValue()))
                .toList();
    }

    /** 供应商：我接过的单的价（接单时的快照）。 */
    @Transactional(readOnly = true)
    public List<SupplierPriceViews.OrderPrice> orderPrices(UUID supplierOrgId) {
        Map<UUID, List<SupplierPriceViews.LinePrice>> byOrder = new LinkedHashMap<>();
        for (SupplierPriceLine s : snapshots.findBySupplierOrgIdOrderByCreatedAtAsc(supplierOrgId)) {
            byOrder.computeIfAbsent(s.getSupplierOrderId(), k -> new ArrayList<>()).add(
                    new SupplierPriceViews.LinePrice(s.getSupplierOrderPartId(), s.getUnitPriceCny(),
                            s.getLineTotalCny()));
        }
        return byOrder.entrySet().stream().map(e -> new SupplierPriceViews.OrderPrice(e.getKey(),
                sum(e.getValue().stream().map(SupplierPriceViews.LinePrice::lineTotalCny).toList()), e.getValue()))
                .toList();
    }

    /**
     * 接单时写快照。同步监听、同一事务：这里抛异常，接单整体回滚（不会出现「单接下了、价没记」）。
     */
    @EventListener
    public void onAccepted(SupplierOrderAccepted event) {
        BigDecimal discount = suppliers.discountOf(event.supplierOrgId())
                .orElseThrow(() -> BusinessException.conflict("dispatch.supplier_not_dispatchable"));
        Map<UUID, BigDecimal> base = basePrices(event.lines().stream()
                .map(SupplierOrderAccepted.Line::customerOrderPartId).toList());
        List<SupplierPriceLine> rows = event.lines().stream().map(l -> new SupplierPriceLine(event.supplierOrderId(),
                l.supplierOrderLineId(), event.supplierOrgId(), l.customerOrderPartId(), l.quantity(),
                base.get(l.customerOrderPartId()), discount)).toList();
        snapshots.saveAllAndFlush(rows);
    }

    /** 每个客户零件行在客户确认那一版报价上的原价。缺任何一行都是数据不一致，409。 */
    private Map<UUID, BigDecimal> basePrices(Collection<UUID> customerOrderPartIds) {
        Set<UUID> ids = Set.copyOf(customerOrderPartIds);
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<UUID, BigDecimal> base = quoteLines.findByQuoteStatusAndCustomerOrderPartIdIn(Quote.Status.CONFIRMED, ids)
                .stream().collect(Collectors.toMap(QuoteLine::getCustomerOrderPartId, QuoteLine::getUnitPriceCny,
                        (a, b) -> a));
        if (!base.keySet().containsAll(ids)) {
            throw BusinessException.conflict("dispatch.base_price_missing");
        }
        return base;
    }

    private static BigDecimal sum(List<BigDecimal> values) {
        return values.stream().reduce(BigDecimal.ZERO.setScale(2), BigDecimal::add);
    }
}
