package com.mfg.domain.order;

import com.mfg.common.exception.BusinessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/** {@link OrderQuoting} 的实现。 */
@Service
class OrderQuotingService implements OrderQuoting {

    private final CustomerOrderRepository orders;
    private final CustomerOrderPartRepository lines;
    private final PartDesignRepository parts;

    OrderQuotingService(CustomerOrderRepository orders, CustomerOrderPartRepository lines, PartDesignRepository parts) {
        this.orders = orders;
        this.lines = lines;
        this.parts = parts;
    }

    @Override
    @Transactional(readOnly = true)
    public QuotableOrder findSubmitted(UUID orderId) {
        return toQuotable(orders.findByIdAndSubmittedAtIsNotNull(orderId)
                .orElseThrow(() -> BusinessException.notFound("order.not_found")));
    }

    @Override
    @Transactional
    public QuotableOrder lockForQuoting(UUID orderId) {
        CustomerOrder order = orders.lockSubmittedById(orderId)
                .orElseThrow(() -> BusinessException.notFound("order.not_found"));
        if (order.getStatus() != CustomerOrder.Status.SUBMITTED && order.getStatus() != CustomerOrder.Status.QUOTED) {
            throw BusinessException.conflict("order.not_quotable");
        }
        return toQuotable(order);
    }

    @Override
    @Transactional
    public void markQuoted(UUID customerOrgId, UUID orderId) {
        CustomerOrder order = orders.findByIdAndCustomerOrgId(orderId, customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("order.not_found"));
        if (order.getStatus() == CustomerOrder.Status.QUOTED) {
            return;
        }
        move(customerOrgId, orderId, CustomerOrder.Status.SUBMITTED, CustomerOrder.Status.QUOTED, "order.not_quotable");
    }

    @Override
    @Transactional
    public QuotableOrder lockForCustomer(UUID customerOrgId, UUID orderId) {
        return toQuotable(orders.lockByIdAndCustomerOrgId(orderId, customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("order.not_found")));
    }

    @Override
    @Transactional
    public void markConfirmed(UUID customerOrgId, UUID orderId) {
        move(customerOrgId, orderId, CustomerOrder.Status.QUOTED, CustomerOrder.Status.CONFIRMED, "order.not_quoted");
    }

    @Override
    @Transactional
    public void markRejected(UUID customerOrgId, UUID orderId) {
        move(customerOrgId, orderId, CustomerOrder.Status.QUOTED, CustomerOrder.Status.SUBMITTED, "order.not_quoted");
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, String> titles(UUID customerOrgId, Collection<UUID> orderIds) {
        if (orderIds.isEmpty()) {
            return Map.of();
        }
        return orders.findByIdInAndCustomerOrgId(orderIds, customerOrgId).stream()
                .filter(o -> o.getTitle() != null)
                .collect(Collectors.toMap(CustomerOrder::getId, CustomerOrder::getTitle));
    }

    private void move(UUID customerOrgId, UUID orderId, CustomerOrder.Status from, CustomerOrder.Status to,
                      String conflictCode) {
        if (orders.transitionStatus(orderId, customerOrgId, from, to, Instant.now()) != 1) {
            throw BusinessException.conflict(conflictCode);
        }
    }

    private QuotableOrder toQuotable(CustomerOrder order) {
        UUID orgId = order.getCustomerOrgId();
        List<CustomerOrderPart> orderLines =
                lines.findByCustomerOrderIdAndCustomerOrgIdOrderByCreatedAtAsc(order.getId(), orgId);
        Set<UUID> partIds = orderLines.stream().map(CustomerOrderPart::getPartDesignId).collect(Collectors.toSet());
        Map<UUID, PartDesign> partById = partIds.isEmpty() ? Map.of()
                : parts.findByIdInAndCustomerOrgId(partIds, orgId).stream()
                        .collect(Collectors.toMap(PartDesign::getId, Function.identity()));
        List<QuotableLine> quotable = orderLines.stream()
                .map(l -> new QuotableLine(l.getId(), partById.get(l.getPartDesignId()).getCode(), l.getPartName(),
                        l.getQuantity()))
                .toList();
        return new QuotableOrder(order.getId(), orgId, order.getStatus().name(), quotable);
    }
}
