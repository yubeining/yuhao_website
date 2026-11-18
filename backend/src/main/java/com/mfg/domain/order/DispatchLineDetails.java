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

    /**
     * 一行：本行 id、上游客户零件行 id、件数，外加生产进度三件套
     * （只有供应商订单的叶子行有，派单池 / 生产订单的行一律 null）。
     */
    record Row(UUID id, UUID customerOrderPartId, int quantity, String status, UUID replacesPartId,
               UUID supersededBy, UUID partDesignId) {

        /** 还没进生产的行（派单池、生产订单）。 */
        static Row plain(UUID id, UUID customerOrderPartId, int quantity) {
            return new Row(id, customerOrderPartId, quantity, null, null, null, null);
        }
    }

    /*
     * ★ 上游可能已经不在了：供应商订单取消后，运营撤回分配会物理删除生产订单零件行，
     *   这时 customerOrderPartId 是 null（已取消订单的叶子行找不回客户零件行）。
     *   这种行只显示它自己还有的东西 —— 图号（按 partDesignId 取）、件数、状态；名称 / 材料 / 图纸留空。
     *   2026-11-18 之前这里直接空指针，那家供应商的订单列表从此一直 500。
     */

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
        Map<UUID, String> orphanCodes = orphanCodes(rows, byId);
        return rows.stream().map(r -> {
            CustomerOrderPart l = lineOf(byId, r);
            if (l == null) {
                return new DispatchViews.OpsLine(r.id(), null, null, null, null, null,
                        orphanCodes.get(r.partDesignId()), null, r.quantity(), null, null, r.status(),
                        r.replacesPartId(), r.supersededBy());
            }
            CustomerOrder o = orders.get(l.getCustomerOrderId());
            return new DispatchViews.OpsLine(r.id(), l.getId(), l.getCustomerOrderId(), l.getCustomerOrgId(),
                    names.get(l.getCustomerOrgId()), o == null ? null : o.getTitle(), codes.get(l.getPartDesignId()),
                    l.getPartName(), r.quantity(), l.getMaterial(), l.getSurfaceTreatment(), r.status(),
                    r.replacesPartId(), r.supersededBy());
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
        Map<UUID, String> orphanCodes = orphanCodes(rows, byId);
        return rows.stream().map(r -> {
            CustomerOrderPart l = lineOf(byId, r);
            if (l == null) {
                return new DispatchViews.SupplierLine(r.id(), orphanCodes.get(r.partDesignId()), null,
                        r.quantity(), null, null, List.of(), r.status(), r.replacesPartId());
            }
            return new DispatchViews.SupplierLine(r.id(), codes.get(l.getPartDesignId()), l.getPartName(),
                    r.quantity(), l.getMaterial(), l.getSurfaceTreatment(),
                    files.getOrDefault(l.getPartRevisionId(), List.of()), r.status(), r.replacesPartId());
        }).toList();
    }

    private Map<UUID, CustomerOrderPart> customerLines(List<Row> rows) {
        Set<UUID> ids = rows.stream().map(Row::customerOrderPartId).filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
        if (ids.isEmpty()) {
            return Map.of();
        }
        return customerLines.findByIdIn(ids).stream()
                .collect(Collectors.toMap(CustomerOrderPart::getId, Function.identity()));
    }

    /** 不可变 Map（{@code Map.of()}）对 null key 的 get / containsKey 会抛空指针，所以先判 null。 */
    private static CustomerOrderPart lineOf(Map<UUID, CustomerOrderPart> byId, Row r) {
        return r.customerOrderPartId() == null ? null : byId.get(r.customerOrderPartId());
    }

    /** 找不回客户零件行的那些行的图号，按它们自己记着的 partDesignId 取。 */
    private Map<UUID, String> orphanCodes(List<Row> rows, Map<UUID, CustomerOrderPart> byId) {
        Set<UUID> partIds = rows.stream()
                .filter(r -> lineOf(byId, r) == null && r.partDesignId() != null)
                .map(Row::partDesignId).collect(Collectors.toSet());
        if (partIds.isEmpty()) {
            return Map.of();
        }
        return parts.findByIdIn(partIds).stream().collect(Collectors.toMap(PartDesign::getId, PartDesign::getCode));
    }

    private Map<UUID, String> codes(Collection<CustomerOrderPart> lines) {
        Set<UUID> partIds = lines.stream().map(CustomerOrderPart::getPartDesignId).collect(Collectors.toSet());
        if (partIds.isEmpty()) {
            return Map.of();
        }
        return parts.findByIdIn(partIds).stream().collect(Collectors.toMap(PartDesign::getId, PartDesign::getCode));
    }
}
