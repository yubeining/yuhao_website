package com.mfg.domain.order;

import com.mfg.domain.supplier.SupplierDirectory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 一张生产订单此刻对某家供应商开不开放（能看、能接）—— 所有供应商端入口都走这里判，不各写一份。
 *
 * <ul>
 *   <li>定向（OFFERED）：这一轮派给了他，且他没拒接。</li>
 *   <li>挂全市场（PUBLISHED）：他是可派单的供应商（启用中、录了折率，2026-09-18 拍板）。</li>
 * </ul>
 */
@Component
class OfferVisibility {

    private final OpsOrderRepository opsOrders;
    private final OpsOrderOfferRepository offers;
    private final SupplierDirectory suppliers;

    OfferVisibility(OpsOrderRepository opsOrders, OpsOrderOfferRepository offers, SupplierDirectory suppliers) {
        this.opsOrders = opsOrders;
        this.offers = offers;
        this.suppliers = suppliers;
    }

    boolean isOpenTo(OpsOrder o, UUID supplierOrgId) {
        return switch (o.getStatus()) {
            case OFFERED -> offers.findByOpsOrderIdAndDispatchRoundAndSupplierOrgId(o.getId(), o.getDispatchRound(),
                    supplierOrgId).map(x -> x.getStatus() == OpsOrderOffer.Status.OFFERED).orElse(false);
            case PUBLISHED -> suppliers.discountOf(supplierOrgId).isPresent();
            default -> false;
        };
    }

    /**
     * 最近一轮派单里他在不在被派的范围内（不管现在还开不开）。用来区分「这张单他确实看到过、只是已经没了」（409）
     * 和「这张单从来不是给他的」（404，不暴露存在）。
     */
    boolean wasInLatestRound(OpsOrder o, UUID supplierOrgId) {
        if (o.getDispatchRound() == 0 || o.getDispatchMode() == null) {
            return false;
        }
        if (o.getDispatchMode() == OpsOrder.DispatchMode.MARKET) {
            return suppliers.discountOf(supplierOrgId).isPresent();
        }
        return offers.findByOpsOrderIdAndDispatchRoundAndSupplierOrgId(o.getId(), o.getDispatchRound(), supplierOrgId)
                .isPresent();
    }

    /** 此刻对他开放的全部生产订单，最近派出的在前。 */
    List<OpsOrder> openTo(UUID supplierOrgId) {
        List<OpsOrderOffer> mine = offers.findBySupplierOrgIdAndStatus(supplierOrgId, OpsOrderOffer.Status.OFFERED);
        Map<UUID, OpsOrderOffer> byOrder = mine.stream()
                .collect(Collectors.toMap(OpsOrderOffer::getOpsOrderId, Function.identity(), (a, b) -> a));
        List<OpsOrder> result = new ArrayList<>();
        if (!byOrder.isEmpty()) {
            opsOrders.findByIdInAndStatus(byOrder.keySet(), OpsOrder.Status.OFFERED).stream()
                    .filter(o -> byOrder.get(o.getId()).getDispatchRound() == o.getDispatchRound())
                    .forEach(result::add);
        }
        if (suppliers.discountOf(supplierOrgId).isPresent()) {
            result.addAll(opsOrders.findByStatusOrderByDispatchedAtDesc(OpsOrder.Status.PUBLISHED));
        }
        result.sort(Comparator.comparing(OpsOrder::getDispatchedAt).reversed());
        return result;
    }
}
