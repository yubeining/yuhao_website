package com.mfg.domain.order;

import com.mfg.common.dto.PagedResponse;
import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.PartyType;
import com.mfg.platform.identity.Organization;
import com.mfg.platform.identity.OrganizationRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 运营端看客户订单（报价要先看单、看图）。只读，跨客户；只看提交过的单，草稿对运营不可见。
 * {@code /ops/**} 端级闸门已限定调用方是运营。
 */
@Service
class OpsCustomerOrderService {

    private final CustomerOrderRepository orders;
    private final CustomerOrderPartRepository lines;
    private final PartFileRepository files;
    private final CustomerOrderService customerOrders;
    private final PartDrawingService drawings;
    private final OrganizationRepository organizations;

    OpsCustomerOrderService(CustomerOrderRepository orders, CustomerOrderPartRepository lines,
                            PartFileRepository files, CustomerOrderService customerOrders,
                            PartDrawingService drawings, OrganizationRepository organizations) {
        this.orders = orders;
        this.lines = lines;
        this.files = files;
        this.customerOrders = customerOrders;
        this.drawings = drawings;
        this.organizations = organizations;
    }

    @Transactional(readOnly = true)
    public PagedResponse<OpsOrderSummaryView> list(CustomerOrder.Status status, Pageable pageable) {
        Page<CustomerOrder> page = status == null
                ? orders.findBySubmittedAtIsNotNull(pageable)
                : orders.findByStatusAndSubmittedAtIsNotNull(status, pageable);
        Map<UUID, long[]> counts = new HashMap<>();
        Map<UUID, String> names = Map.of();
        if (page.hasContent()) {
            for (Object[] row : lines.summarizeAcrossCustomers(page.map(CustomerOrder::getId).getContent())) {
                counts.put((UUID) row[0], new long[] {((Number) row[1]).longValue(), ((Number) row[2]).longValue()});
            }
            names = customerNames(page.getContent().stream().map(CustomerOrder::getCustomerOrgId)
                    .collect(Collectors.toSet()));
        }
        Map<UUID, String> customerNames = names;
        return PagedResponse.of(page, o -> {
            long[] c = counts.getOrDefault(o.getId(), new long[] {0, 0});
            return new OpsOrderSummaryView(o.getId(), o.getCustomerOrgId(), customerNames.get(o.getCustomerOrgId()),
                    o.getTitle(), o.getStatus().name(), o.getWantedDate(), c[0], c[1],
                    o.getCreatedAt(), o.getSubmittedAt());
        });
    }

    @Transactional(readOnly = true)
    public OpsOrderView get(UUID orderId) {
        CustomerOrder order = requireSubmitted(orderId);
        UUID orgId = order.getCustomerOrgId();
        List<OrderLineView> lineViews = customerOrders.lineViews(orgId,
                lines.findByCustomerOrderIdAndCustomerOrgIdOrderByCreatedAtAsc(orderId, orgId));
        return new OpsOrderView(order.getId(), orgId, customerNames(Set.of(orgId)).get(orgId), order.getTitle(),
                order.getStatus().name(), order.getWantedDate(), order.getCreatedAt(), order.getSubmittedAt(),
                lineViews);
    }

    /**
     * 运营在订单里看图。和客户端同一套校验（订单 → 行 → 文件属于这一行锁定的版本），任何一环对不上都是 404、不落审计。
     * 审计里访问方记运营本人和运营所在组织，图纸归属记客户。
     */
    public ViewUrl lineFileViewUrl(UUID opsUserId, UUID opsOrgId, UUID orderId, UUID lineId, UUID fileId) {
        CustomerOrder order = requireSubmitted(orderId);
        UUID orgId = order.getCustomerOrgId();
        CustomerOrderPart line = lines.findByIdAndCustomerOrderIdAndCustomerOrgId(lineId, orderId, orgId)
                .orElseThrow(() -> BusinessException.notFound("order.line_not_found"));
        PartFile file = files.findByIdAndCustomerOrgId(fileId, orgId)
                .filter(f -> f.getPartRevisionId().equals(line.getPartRevisionId()))
                .orElseThrow(() -> BusinessException.notFound("part.file_not_found"));
        return drawings.issueViewUrl(orgId, opsUserId, PartyType.OPERATOR, opsOrgId, file.getId(),
                PartFileAccessLog.ContextType.CUSTOMER_ORDER, orderId);
    }

    private CustomerOrder requireSubmitted(UUID orderId) {
        return orders.findByIdAndSubmittedAtIsNotNull(orderId)
                .orElseThrow(() -> BusinessException.notFound("order.not_found"));
    }

    private Map<UUID, String> customerNames(Set<UUID> orgIds) {
        return organizations.findAllById(orgIds).stream()
                .collect(Collectors.toMap(Organization::getId, Organization::getName));
    }
}
