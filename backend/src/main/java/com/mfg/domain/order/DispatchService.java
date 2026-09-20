package com.mfg.domain.order;

import com.mfg.common.exception.BusinessException;
import com.mfg.domain.supplier.SupplierDirectory;
import com.mfg.platform.identity.OrganizationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 运营端派单：派单池 → 建生产订单 → 把客户零件行拆进去 → 定向派 / 挂全市场 → 收回 / 收回供应商（2026-09-18 拍板，文档 12 §3 §4）。
 *
 * <p><b>拆行一次拆完</b>：一行拆成几份时各份之和必须等于该行数量；撤回也是整行所有份一起撤。本轮不做生产订单取消 ——
 * 取消一张会让被拆开的那一行只剩一部分已派，破坏「一次拆完」。
 *
 * <p><b>加锁顺序</b>固定为「客户订单 → 生产订单（按 id 排序）→ 供应商订单」，所有写操作都在锁里判状态。
 */
@Service
class DispatchService implements OrderDispatching {

    /** 还在手上的供应商订单（没取消的）：已接、待签、已签。 */
    static final Set<SupplierOrder.Status> ACTIVE_SUPPLIER_ORDER = Set.of(SupplierOrder.Status.ACCEPTED,
            SupplierOrder.Status.CONTRACT_PENDING, SupplierOrder.Status.CONTRACTED);

    private final OpsOrderRepository opsOrders;
    private final OpsOrderPartRepository opsParts;
    private final OpsOrderOfferRepository offers;
    private final SupplierOrderRepository supplierOrders;
    private final CustomerOrderRepository customerOrders;
    private final CustomerOrderPartRepository customerLines;
    private final DispatchLineDetails details;
    private final OfferVisibility visibility;
    private final SupplierDirectory suppliers;
    private final OrganizationRepository organizations;
    private final SignDeadline signDeadline;

    DispatchService(OpsOrderRepository opsOrders, OpsOrderPartRepository opsParts, OpsOrderOfferRepository offers,
                    SupplierOrderRepository supplierOrders, CustomerOrderRepository customerOrders,
                    CustomerOrderPartRepository customerLines, DispatchLineDetails details,
                    OfferVisibility visibility, SupplierDirectory suppliers, OrganizationRepository organizations,
                    SignDeadline signDeadline) {
        this.opsOrders = opsOrders;
        this.opsParts = opsParts;
        this.offers = offers;
        this.supplierOrders = supplierOrders;
        this.customerOrders = customerOrders;
        this.customerLines = customerLines;
        this.details = details;
        this.visibility = visibility;
        this.suppliers = suppliers;
        this.organizations = organizations;
        this.signDeadline = signDeadline;
    }

    record PartInput(UUID opsOrderId, int quantity) {
    }

    // ---------- 派单池 ----------

    /** 已确认报价的客户订单里、还没拆进任何生产订单的行。先提交的在前。 */
    @Transactional(readOnly = true)
    public List<DispatchViews.PoolLine> pool() {
        List<CustomerOrder> confirmed = customerOrders.findByStatusOrderBySubmittedAtAsc(CustomerOrder.Status.CONFIRMED);
        if (confirmed.isEmpty()) {
            return List.of();
        }
        Map<UUID, CustomerOrder> orderById = confirmed.stream()
                .collect(Collectors.toMap(CustomerOrder::getId, o -> o));
        List<CustomerOrderPart> lines = customerLines.findByCustomerOrderIdInOrderByCreatedAtAsc(orderById.keySet());
        Set<UUID> allocated = opsParts.findByUpstreamPartIdIn(lines.stream().map(CustomerOrderPart::getId).toList())
                .stream().map(OpsOrderPart::getUpstreamPartId).collect(Collectors.toSet());
        List<CustomerOrderPart> open = lines.stream().filter(l -> !allocated.contains(l.getId())).toList();
        Map<UUID, DispatchViews.OpsLine> view = details.forOps(open.stream()
                        .map(l -> new DispatchLineDetails.Row(l.getId(), l.getId(), l.getQuantity())).toList())
                .stream().collect(Collectors.toMap(DispatchViews.OpsLine::id, v -> v));
        return open.stream().map(l -> {
            DispatchViews.OpsLine v = view.get(l.getId());
            return new DispatchViews.PoolLine(l.getId(), l.getCustomerOrderId(), l.getCustomerOrgId(), v.customerName(),
                    v.orderTitle(), v.code(), v.partName(), l.getQuantity(), v.material(), v.surfaceTreatment(),
                    orderById.get(l.getCustomerOrderId()).getSubmittedAt());
        }).toList();
    }

    // ---------- 生产订单 ----------

    @Transactional
    public DispatchViews.OpsOrderDetail create(UUID opsUserId) {
        return detail(opsOrders.saveAndFlush(new OpsOrder(opsUserId)).getId());
    }

    /** 只能删组装中、一行都没有的。 */
    @Transactional
    public void delete(UUID opsOrderId) {
        OpsOrder o = lock(opsOrderId);
        requireAssembling(o);
        if (opsParts.countByOpsOrderId(opsOrderId) > 0) {
            throw BusinessException.conflict("dispatch.ops_order_not_empty");
        }
        opsOrders.delete(o);
    }

    @Transactional(readOnly = true)
    public List<DispatchViews.OpsOrderSummary> list(OpsOrder.Status status) {
        List<OpsOrder> list = status == null ? opsOrders.findAllByOrderByCreatedAtDesc()
                : opsOrders.findByStatusOrderByCreatedAtDesc(status);
        if (list.isEmpty()) {
            return List.of();
        }
        List<UUID> ids = list.stream().map(OpsOrder::getId).toList();
        Map<UUID, List<OpsOrderPart>> partsByOrder = opsParts.findByOpsOrderIdIn(ids).stream()
                .collect(Collectors.groupingBy(OpsOrderPart::getOpsOrderId));
        Map<UUID, UUID> acceptedSupplier = supplierOrders.findByOpsOrderIdInAndStatusIn(ids, ACTIVE_SUPPLIER_ORDER)
                .stream().collect(Collectors.toMap(SupplierOrder::getOpsOrderId, SupplierOrder::getSupplierOrgId));
        Map<UUID, String> names = orgNames(acceptedSupplier.values());
        return list.stream().map(o -> {
            List<OpsOrderPart> ps = partsByOrder.getOrDefault(o.getId(), List.of());
            UUID sup = acceptedSupplier.get(o.getId());
            return new DispatchViews.OpsOrderSummary(o.getId(), o.getStatus().name(), name(o.getDispatchMode()),
                    o.getSupplierDueDate(), o.getDispatchedAt(), ps.size(),
                    ps.stream().mapToInt(OpsOrderPart::getQuantity).sum(),
                    (int) ps.stream().map(OpsOrderPart::getSourceCustomerId).distinct().count(),
                    sup == null ? null : names.get(sup), o.getCreatedAt());
        }).toList();
    }

    @Transactional(readOnly = true)
    public DispatchViews.OpsOrderDetail detail(UUID opsOrderId) {
        OpsOrder o = opsOrders.findById(opsOrderId)
                .orElseThrow(() -> BusinessException.notFound("dispatch.ops_order_not_found"));
        List<OpsOrderPart> ps = opsParts.findByOpsOrderIdOrderByCreatedAtAsc(opsOrderId);
        List<OpsOrderOffer> os = offers.findByOpsOrderIdOrderByDispatchRoundDescCreatedAtAsc(opsOrderId);
        List<SupplierOrder> sos = supplierOrders.findByOpsOrderIdOrderByAcceptedAtDesc(opsOrderId);
        Set<UUID> orgIds = new HashSet<>();
        os.forEach(x -> orgIds.add(x.getSupplierOrgId()));
        sos.forEach(x -> orgIds.add(x.getSupplierOrgId()));
        Map<UUID, String> names = orgNames(orgIds);
        return new DispatchViews.OpsOrderDetail(o.getId(), o.getStatus().name(), name(o.getDispatchMode()),
                o.getDispatchRound(), o.getSupplierDueDate(), o.getDispatchedAt(), o.getCreatedAt(),
                details.forOps(ps.stream().map(p -> new DispatchLineDetails.Row(p.getId(), p.getUpstreamPartId(),
                        p.getQuantity())).toList()),
                os.stream().map(x -> new DispatchViews.OpsOffer(x.getSupplierOrgId(), names.get(x.getSupplierOrgId()),
                        x.getDispatchRound(), x.getStatus().name(), x.getRespondedAt())).toList(),
                sos.stream().map(x -> supplierOrderView(x, names)).toList());
    }

    // ---------- 拆行 ----------

    /**
     * 把一个客户零件行拆进一张或几张生产订单。各份之和必须等于该行数量（一次拆完，2026-09-18）；
     * 该行拆过就不能再拆（先撤回）；目标生产订单都得在组装中。
     */
    @Transactional
    public DispatchViews.Allocation allocate(UUID customerOrderPartId, List<PartInput> inputs) {
        Set<UUID> targets = new HashSet<>();
        for (PartInput in : inputs) {
            if (!targets.add(in.opsOrderId())) {
                throw BusinessException.badRequest("dispatch.duplicate_ops_order");
            }
        }
        CustomerOrderPart line = lockLine(customerOrderPartId);
        if (inputs.stream().mapToInt(PartInput::quantity).sum() != line.getQuantity()) {
            throw BusinessException.badRequest("dispatch.quantity_mismatch");
        }
        if (opsParts.existsByUpstreamPartId(line.getId())) {
            throw BusinessException.conflict("dispatch.line_allocated");
        }
        lockAllAssembling(targets);
        List<DispatchViews.AllocatedPart> created = new ArrayList<>();
        for (PartInput in : inputs) {
            OpsOrderPart p = opsParts.save(new OpsOrderPart(in.opsOrderId(), line.getPartDesignId(),
                    UUID.randomUUID().toString(), in.quantity(), line.getId(), line.getCustomerOrderId(),
                    line.getCustomerOrgId()));
            created.add(new DispatchViews.AllocatedPart(in.opsOrderId(), p.getId(), in.quantity()));
        }
        return new DispatchViews.Allocation(line.getId(), created);
    }

    /** 撤回分配：这一行所有份一起撤，涉及的生产订单都得还在组装中。 */
    @Transactional
    public void unallocate(UUID customerOrderPartId) {
        CustomerOrderPart line = lockLine(customerOrderPartId);
        List<OpsOrderPart> ps = opsParts.findByUpstreamPartId(line.getId());
        if (ps.isEmpty()) {
            throw BusinessException.conflict("dispatch.line_not_allocated");
        }
        lockAllAssembling(ps.stream().map(OpsOrderPart::getOpsOrderId).collect(Collectors.toSet()));
        opsParts.deleteAll(ps);
    }

    // ---------- 派出 / 收回 ----------

    /** 定向派给几家（先到先得）。每家都得是可派单的（启用中、有折率）。 */
    @Transactional
    public DispatchViews.OpsOrderDetail offer(UUID opsOrderId, List<UUID> supplierOrgIds, LocalDate dueDate) {
        if (supplierOrgIds.isEmpty() || new HashSet<>(supplierOrgIds).size() != supplierOrgIds.size()) {
            throw BusinessException.badRequest("dispatch.suppliers_invalid");
        }
        OpsOrder o = lockDispatchable(opsOrderId);
        for (UUID s : supplierOrgIds) {
            if (suppliers.discountOf(s).isEmpty()) {
                throw BusinessException.conflict("dispatch.supplier_not_dispatchable");
            }
        }
        o.dispatch(OpsOrder.DispatchMode.TARGETED, dueDate, Instant.now());
        opsOrders.saveAndFlush(o);
        for (UUID s : supplierOrgIds) {
            offers.save(new OpsOrderOffer(o.getId(), o.getDispatchRound(), s));
        }
        offers.flush();
        return detail(opsOrderId);
    }

    /** 挂全市场：所有可派单的供应商都看得到，先到先得。 */
    @Transactional
    public DispatchViews.OpsOrderDetail publish(UUID opsOrderId, LocalDate dueDate) {
        OpsOrder o = lockDispatchable(opsOrderId);
        o.dispatch(OpsOrder.DispatchMode.MARKET, dueDate, Instant.now());
        opsOrders.saveAndFlush(o);
        return detail(opsOrderId);
    }

    /** 收回：还没人接的时候撤回到组装中；这一轮还开着的定向记录作废。 */
    @Transactional
    public DispatchViews.OpsOrderDetail recall(UUID opsOrderId) {
        OpsOrder o = lock(opsOrderId);
        if (!o.isOpen()) {
            throw BusinessException.conflict("dispatch.not_open");
        }
        offers.findByOpsOrderIdAndDispatchRound(o.getId(), o.getDispatchRound()).stream()
                .filter(x -> x.getStatus() == OpsOrderOffer.Status.OFFERED)
                .forEach(OpsOrderOffer::revoke);
        o.backToAssembling();
        opsOrders.saveAndFlush(o);
        return detail(opsOrderId);
    }

    /** 签字前收回供应商（文档 12 §4）：供应商订单取消（REVOKED），生产订单回组装中重派。签过字的收不回。 */
    @Transactional
    public DispatchViews.OpsOrderDetail revokeSupplier(UUID opsOrderId) {
        OpsOrder o = lock(opsOrderId);
        SupplierOrder so = supplierOrders.findFirstByOpsOrderIdAndStatusIn(o.getId(), ACTIVE_SUPPLIER_ORDER)
                .filter(x -> o.getStatus() == OpsOrder.Status.ASSIGNED)
                .orElseThrow(() -> BusinessException.conflict("dispatch.not_assigned"));
        if (so.isSigned()) {
            throw BusinessException.conflict("dispatch.contract_signed");
        }
        so.cancel(SupplierOrder.CancelReason.REVOKED, Instant.now());
        supplierOrders.saveAndFlush(so);
        o.backToAssembling();
        opsOrders.saveAndFlush(o);
        return detail(opsOrderId);
    }

    // ---------- 合同（2026-09-20：只有交互和签字，没有 PDF、没有条款正文） ----------

    /** 运营建合同：已接单 → 待签。已经建过 409；签过字的不能重建。 */
    @Transactional
    public DispatchViews.OpsSupplierOrder createContract(UUID opsUserId, UUID supplierOrderId) {
        SupplierOrder so = requireSupplierOrder(supplierOrderId);
        switch (so.getStatus()) {
            case ACCEPTED -> so.createContract(opsUserId, Instant.now());
            case CONTRACT_PENDING -> throw BusinessException.conflict("dispatch.contract_exists");
            case CONTRACTED -> throw BusinessException.conflict("dispatch.contract_signed");
            default -> throw BusinessException.conflict("dispatch.supplier_order_not_active");
        }
        return supplierOrderView(supplierOrders.saveAndFlush(so));
    }

    /** 运营作废合同：待签 → 回到已接单，可以重建。签过字的作废不了。 */
    @Transactional
    public DispatchViews.OpsSupplierOrder cancelContract(UUID supplierOrderId) {
        SupplierOrder so = requireSupplierOrder(supplierOrderId);
        if (so.isSigned()) {
            throw BusinessException.conflict("dispatch.contract_signed");
        }
        if (so.getStatus() != SupplierOrder.Status.CONTRACT_PENDING) {
            throw BusinessException.conflict("dispatch.contract_missing");
        }
        so.cancelContract();
        return supplierOrderView(supplierOrders.saveAndFlush(so));
    }

    private SupplierOrder requireSupplierOrder(UUID supplierOrderId) {
        SupplierOrder so = supplierOrders.findById(supplierOrderId)
                .orElseThrow(() -> BusinessException.notFound("dispatch.supplier_order_not_found"));
        opsOrders.lockById(so.getOpsOrderId())
                .orElseThrow(() -> BusinessException.notFound("dispatch.ops_order_not_found"));
        return so;
    }

    private DispatchViews.OpsSupplierOrder supplierOrderView(SupplierOrder so) {
        return supplierOrderView(so, orgNames(List.of(so.getSupplierOrgId())));
    }

    // ---------- OrderDispatching ----------

    @Override
    @Transactional(readOnly = true)
    public List<DispatchLine> opsOrderLines(UUID opsOrderId) {
        if (!opsOrders.existsById(opsOrderId)) {
            throw BusinessException.notFound("dispatch.ops_order_not_found");
        }
        return toLines(opsParts.findByOpsOrderIdOrderByCreatedAtAsc(opsOrderId));
    }

    @Override
    @Transactional(readOnly = true)
    public List<DispatchLine> openLinesFor(UUID supplierOrgId, Collection<UUID> opsOrderIds) {
        List<UUID> open = opsOrders.findAllById(opsOrderIds).stream()
                .filter(o -> visibility.isOpenTo(o, supplierOrgId))
                .map(OpsOrder::getId).toList();
        if (open.isEmpty()) {
            return List.of();
        }
        List<OpsOrderPart> ps = new ArrayList<>(opsParts.findByOpsOrderIdIn(open));
        ps.sort((a, b) -> a.getCreatedAt().compareTo(b.getCreatedAt()));
        return toLines(ps);
    }

    // ---------- helpers ----------

    private static List<DispatchLine> toLines(List<OpsOrderPart> ps) {
        return ps.stream().map(p -> new DispatchLine(p.getOpsOrderId(), p.getId(), p.getUpstreamPartId(),
                p.getQuantity())).toList();
    }

    /** 取客户零件行并锁它所属的客户订单（同一行的拆 / 撤只能排队）；订单必须已确认报价。 */
    private CustomerOrderPart lockLine(UUID customerOrderPartId) {
        CustomerOrderPart line = customerLines.findById(customerOrderPartId)
                .orElseThrow(() -> BusinessException.notFound("order.line_not_found"));
        CustomerOrder order = customerOrders.lockSubmittedById(line.getCustomerOrderId())
                .orElseThrow(() -> BusinessException.notFound("order.line_not_found"));
        if (order.getStatus() != CustomerOrder.Status.CONFIRMED) {
            throw BusinessException.conflict("dispatch.order_not_confirmed");
        }
        return line;
    }

    private void lockAllAssembling(Set<UUID> opsOrderIds) {
        opsOrderIds.stream().sorted().forEach(id -> requireAssembling(lock(id)));
    }

    private OpsOrder lockDispatchable(UUID opsOrderId) {
        OpsOrder o = lock(opsOrderId);
        requireAssembling(o);
        if (opsParts.countByOpsOrderId(opsOrderId) == 0) {
            throw BusinessException.conflict("dispatch.ops_order_empty");
        }
        return o;
    }

    private OpsOrder lock(UUID opsOrderId) {
        return opsOrders.lockById(opsOrderId)
                .orElseThrow(() -> BusinessException.notFound("dispatch.ops_order_not_found"));
    }

    private static void requireAssembling(OpsOrder o) {
        if (o.getStatus() != OpsOrder.Status.ASSEMBLING) {
            throw BusinessException.conflict("dispatch.ops_order_not_assembling");
        }
    }

    private Map<UUID, String> orgNames(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<UUID, String> m = new HashMap<>();
        organizations.findAllById(ids).forEach(o -> m.put(o.getId(), o.getName()));
        return m;
    }

    private DispatchViews.OpsSupplierOrder supplierOrderView(SupplierOrder so, Map<UUID, String> names) {
        return new DispatchViews.OpsSupplierOrder(so.getId(), so.getSupplierOrgId(),
                names.get(so.getSupplierOrgId()), so.getStatus().name(), so.getSupplierDueDate(), so.getAcceptedAt(),
                so.getContractCreatedAt(), so.getSignedAt(), signDeadline.deadlineOf(so.getAcceptedAt()),
                so.getCancelledAt(), name(so.getCancelReason()));
    }

    private static String name(Enum<?> e) {
        return e == null ? null : e.name();
    }
}
