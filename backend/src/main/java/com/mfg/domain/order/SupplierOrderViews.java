package com.mfg.domain.order;

import com.mfg.platform.identity.Organization;
import com.mfg.platform.identity.OrganizationRepository;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 供应商订单的两个视图：给供应商的（不含任何客户信息）和给运营的（带客户信息 + 生产进度）。
 *
 * <p>接单 / 合同 / 生产 / 质检都要把同一张单渲染出来，所以集中在这里，不在各个 service 里各写一份。
 */
@Component
class SupplierOrderViews {

    private final OpsOrderPartRepository opsParts;
    private final DispatchLineDetails details;
    private final SignDeadline signDeadline;
    private final OrganizationRepository organizations;
    private final SupplierShipmentRepository shipments;

    SupplierOrderViews(OpsOrderPartRepository opsParts, DispatchLineDetails details, SignDeadline signDeadline,
                       OrganizationRepository organizations, SupplierShipmentRepository shipments) {
        this.opsParts = opsParts;
        this.details = details;
        this.signDeadline = signDeadline;
        this.organizations = organizations;
        this.shipments = shipments;
    }

    DispatchViews.SupplierOrderView forSupplier(SupplierOrder so, List<SupplierOrderPart> ps) {
        return new DispatchViews.SupplierOrderView(so.getId(), so.getOpsOrderId(), so.getStatus().name(),
                so.getSupplierDueDate(), so.getAcceptedAt(), so.getContractCreatedAt(), so.getSignedAt(),
                signDeadline.deadlineOf(so.getAcceptedAt()), so.getCancelledAt(),
                so.getCancelReason() == null ? null : so.getCancelReason().name(), details.forSupplier(rows(ps)),
                shipmentsOf(so, ps));
    }

    DispatchViews.OpsProductionOrder forOps(SupplierOrder so, List<SupplierOrderPart> ps) {
        String supplierName = organizations.findById(so.getSupplierOrgId()).map(Organization::getName).orElse(null);
        return new DispatchViews.OpsProductionOrder(so.getId(), so.getOpsOrderId(), so.getSupplierOrgId(),
                supplierName, so.getStatus().name(), so.getSupplierDueDate(), so.getAcceptedAt(), so.getSignedAt(),
                details.forOps(rows(ps)), shipmentsOf(so, ps));
    }

    /** 每一批发了哪几行：按零件行上记的批次 id 归组。还没发过就是空列表。 */
    private List<DispatchViews.Shipment> shipmentsOf(SupplierOrder so, List<SupplierOrderPart> ps) {
        List<SupplierShipment> batches = shipments.findBySupplierOrderIdOrderByShippedAtAsc(so.getId());
        if (batches.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<UUID>> linesByBatch = ps.stream()
                .filter(p -> p.getSupplierShipmentId() != null)
                .collect(Collectors.groupingBy(SupplierOrderPart::getSupplierShipmentId,
                        Collectors.mapping(SupplierOrderPart::getId, Collectors.toList())));
        return batches.stream()
                .map(b -> new DispatchViews.Shipment(b.getId(), b.getCarrier(), b.getTrackingNo(), b.getShippedAt(),
                        linesByBatch.getOrDefault(b.getId(), List.of())))
                .toList();
    }

    /** 叶子行 → 显示行：零件名称 / 图号 / 材料这些要顺着上游取到客户零件行。 */
    private List<DispatchLineDetails.Row> rows(List<SupplierOrderPart> ps) {
        Map<UUID, UUID> upstreamCustomerLine = opsParts.findAllById(
                        ps.stream().map(SupplierOrderPart::getUpstreamPartId).toList()).stream()
                .collect(Collectors.toMap(OpsOrderPart::getId, OpsOrderPart::getUpstreamPartId));
        return ps.stream()
                .map(sp -> new DispatchLineDetails.Row(sp.getId(), upstreamCustomerLine.get(sp.getUpstreamPartId()),
                        sp.getQuantity(), sp.getFulfillmentStatus().name(), sp.getReplacesPartId(),
                        sp.getSupersededBy(), sp.getPartDesignId()))
                .toList();
    }
}
