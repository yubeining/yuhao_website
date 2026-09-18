package com.mfg.domain.order;

import com.mfg.platform.identity.Organization;
import com.mfg.platform.identity.OrganizationRepository;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 把生产订单 / 供应商订单的行补全成可显示的内容：零件名称、图号、材料、表面处理、图纸 —— 都取自上游的客户零件行。
 * 运营版额外带客户名和订单名；<b>供应商版不带任何客户信息</b>。
 */
@Component
class DispatchLineDetails {

    /** 一行：本行 id、上游客户零件行 id、件数。 */
    record Row(UUID id, UUID customerOrderPartId, int quantity) {
    }

    private final CustomerOrderPartRepository customerLines;
    private final CustomerOrderRepository customerOrders;
    private final PartDesignRepository parts;
    private final PartDrawingService drawings;
    private final OrganizationRepository organizations;

    DispatchLineDetails(CustomerOrderPartRepository customerLines, CustomerOrderRepository customerOrders,
                        PartDesignRepository parts, PartDrawingService drawings,
                        OrganizationRepository organizations) {
        this.customerLines = customerLines;
        this.customerOrders = customerOrders;
        this.parts = parts;
        this.drawings = drawings;
        this.organizations = organizations;
    }

    List<DispatchViews.OpsLine> forOps(List<Row> rows) {
        Map<UUID, CustomerOrderPart> byId = customerLines(rows);
        Map<UUID, String> codes = codes(byId.values());
        Map<UUID, CustomerOrder> orders = customerOrders.findAllById(
                        byId.values().stream().map(CustomerOrderPart::getCustomerOrderId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(CustomerOrder::getId, Function.identity()));
        Map<UUID, String> names = organizations.findAllById(
                        byId.values().stream().map(CustomerOrderPart::getCustomerOrgId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(Organization::getId, Organization::getName));
        return rows.stream().map(r -> {
            CustomerOrderPart l = byId.get(r.customerOrderPartId());
            CustomerOrder o = orders.get(l.getCustomerOrderId());
            return new DispatchViews.OpsLine(r.id(), l.getId(), l.getCustomerOrderId(), l.getCustomerOrgId(),
                    names.get(l.getCustomerOrgId()), o == null ? null : o.getTitle(), codes.get(l.getPartDesignId()),
                    l.getPartName(), r.quantity(), l.getMaterial(), l.getSurfaceTreatment());
        }).toList();
    }

    List<DispatchViews.SupplierLine> forSupplier(List<Row> rows) {
        Map<UUID, CustomerOrderPart> byId = customerLines(rows);
        Map<UUID, String> codes = codes(byId.values());
        Map<UUID, List<FileView>> files = new HashMap<>();
        byId.values().stream()
                .collect(Collectors.groupingBy(CustomerOrderPart::getCustomerOrgId,
                        Collectors.mapping(CustomerOrderPart::getPartRevisionId, Collectors.toSet())))
                .forEach((orgId, revisionIds) -> files.putAll(drawings.completedFilesByRevision(orgId, revisionIds)));
        return rows.stream().map(r -> {
            CustomerOrderPart l = byId.get(r.customerOrderPartId());
            return new DispatchViews.SupplierLine(r.id(), codes.get(l.getPartDesignId()), l.getPartName(),
                    r.quantity(), l.getMaterial(), l.getSurfaceTreatment(),
                    files.getOrDefault(l.getPartRevisionId(), List.of()));
        }).toList();
    }

    private Map<UUID, CustomerOrderPart> customerLines(List<Row> rows) {
        Set<UUID> ids = rows.stream().map(Row::customerOrderPartId).collect(Collectors.toSet());
        if (ids.isEmpty()) {
            return Map.of();
        }
        return customerLines.findByIdIn(ids).stream()
                .collect(Collectors.toMap(CustomerOrderPart::getId, Function.identity()));
    }

    private Map<UUID, String> codes(Collection<CustomerOrderPart> lines) {
        Set<UUID> partIds = lines.stream().map(CustomerOrderPart::getPartDesignId).collect(Collectors.toSet());
        if (partIds.isEmpty()) {
            return Map.of();
        }
        return parts.findByIdIn(partIds).stream().collect(Collectors.toMap(PartDesign::getId, PartDesign::getCode));
    }
}
