package com.mfg.domain.order;

import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.PartyType;
import com.mfg.domain.supplier.SupplierDirectory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 供应商端：看派给我的 / 市场上的单、看图、接单、拒接、退单（2026-09-18 拍板，文档 12 §3 §4）。
 *
 * <p>每个方法都显式收 {@code supplierOrgId}（§3 铁律 1）。看不到的单一律 404，不暴露存在；
 * 这一轮给过他、现在已经没了（被别人接走 / 被收回）的，接单回 409 {@code dispatch.not_open}。
 *
 * <p>接单：锁生产订单 → 判此刻对他开放 → 他得是可派单的 → 生成供应商订单和行 → 生产订单改成已接 →
 * 同步发 {@link SupplierOrderAccepted}，报价域在同一事务里写对供价快照，写不成整体回滚。
 */
@Service
class SupplierOfferService {

    private final OpsOrderRepository opsOrders;
    private final OpsOrderPartRepository opsParts;
    private final OpsOrderOfferRepository offers;
    private final SupplierOrderRepository supplierOrders;
    private final SupplierOrderPartRepository supplierParts;
    private final CustomerOrderPartRepository customerLines;
    private final PartFileRepository files;
    private final PartDrawingService drawings;
    private final DispatchLineDetails details;
    private final OfferVisibility visibility;
    private final SupplierDirectory suppliers;
    private final SignDeadline signDeadline;
    private final ApplicationEventPublisher events;

    SupplierOfferService(OpsOrderRepository opsOrders, OpsOrderPartRepository opsParts,
                         OpsOrderOfferRepository offers, SupplierOrderRepository supplierOrders,
                         SupplierOrderPartRepository supplierParts, CustomerOrderPartRepository customerLines,
                         PartFileRepository files, PartDrawingService drawings, DispatchLineDetails details,
                         OfferVisibility visibility, SupplierDirectory suppliers, SignDeadline signDeadline,
                         ApplicationEventPublisher events) {
        this.opsOrders = opsOrders;
        this.opsParts = opsParts;
        this.offers = offers;
        this.supplierOrders = supplierOrders;
        this.supplierParts = supplierParts;
        this.customerLines = customerLines;
        this.files = files;
        this.drawings = drawings;
        this.details = details;
        this.visibility = visibility;
        this.suppliers = suppliers;
        this.signDeadline = signDeadline;
        this.events = events;
    }

    // ---------- 看单 ----------

    @Transactional(readOnly = true)
    public List<DispatchViews.SupplierOfferSummary> offers(UUID supplierOrgId) {
        List<OpsOrder> open = visibility.openTo(supplierOrgId);
        if (open.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<OpsOrderPart>> partsByOrder = opsParts.findByOpsOrderIdIn(
                open.stream().map(OpsOrder::getId).toList()).stream()
                .collect(Collectors.groupingBy(OpsOrderPart::getOpsOrderId));
        return open.stream().map(o -> {
            List<OpsOrderPart> ps = partsByOrder.getOrDefault(o.getId(), List.of());
            return new DispatchViews.SupplierOfferSummary(o.getId(), o.getDispatchMode().name(),
                    o.getSupplierDueDate(), o.getDispatchedAt(), ps.size(),
                    ps.stream().mapToInt(OpsOrderPart::getQuantity).sum());
        }).toList();
    }

    @Transactional(readOnly = true)
    public DispatchViews.SupplierOffer offer(UUID supplierOrgId, UUID opsOrderId) {
        OpsOrder o = requireOpen(opsOrders.findById(opsOrderId), supplierOrgId);
        return new DispatchViews.SupplierOffer(o.getId(), o.getDispatchMode().name(), o.getSupplierDueDate(),
                o.getDispatchedAt(), details.forSupplier(opsParts.findByOpsOrderIdOrderByCreatedAtAsc(o.getId())
                .stream().map(p -> new DispatchLineDetails.Row(p.getId(), p.getUpstreamPartId(), p.getQuantity()))
                .toList()));
    }

    // ---------- 接单 / 拒接 ----------

    @Transactional
    public DispatchViews.SupplierOrderView accept(UUID supplierOrgId, UUID userId, UUID opsOrderId) {
        OpsOrder o = opsOrders.lockById(opsOrderId)
                .orElseThrow(() -> BusinessException.notFound("dispatch.offer_not_found"));
        if (!visibility.isOpenTo(o, supplierOrgId)) {
            throw visibility.wasInLatestRound(o, supplierOrgId)
                    ? BusinessException.conflict("dispatch.not_open")
                    : BusinessException.notFound("dispatch.offer_not_found");
        }
        if (suppliers.discountOf(supplierOrgId).isEmpty()) {
            throw BusinessException.conflict("dispatch.supplier_not_dispatchable");
        }
        Instant now = Instant.now();
        SupplierOrder so = supplierOrders.saveAndFlush(
                new SupplierOrder(supplierOrgId, userId, o.getId(), o.getSupplierDueDate(), now));
        List<SupplierOrderPart> created = new ArrayList<>();
        List<SupplierOrderAccepted.Line> acceptedLines = new ArrayList<>();
        for (OpsOrderPart p : opsParts.findByOpsOrderIdOrderByCreatedAtAsc(o.getId())) {
            SupplierOrderPart sp = supplierParts.save(new SupplierOrderPart(so.getId(), p.getPartDesignId(),
                    UUID.randomUUID().toString(), p.getQuantity(), p.getId(), p.getSourceCustomerOrderId(),
                    p.getSourceCustomerId()));
            created.add(sp);
            acceptedLines.add(new SupplierOrderAccepted.Line(sp.getId(), p.getUpstreamPartId(), p.getQuantity()));
        }
        supplierParts.flush();
        o.assign();
        opsOrders.saveAndFlush(o);
        events.publishEvent(new SupplierOrderAccepted(so.getId(), supplierOrgId, acceptedLines));
        return orderView(so, created);
    }

    /** 拒接只对定向派单：只把他移出，其余照常；这一轮全部拒接了，生产订单回组装中（2026-09-18 拍板）。 */
    @Transactional
    public DispatchViews.Declined decline(UUID supplierOrgId, UUID opsOrderId) {
        OpsOrder o = requireOpen(opsOrders.lockById(opsOrderId), supplierOrgId);
        if (o.getStatus() != OpsOrder.Status.OFFERED) {
            throw BusinessException.conflict("dispatch.not_targeted");
        }
        List<OpsOrderOffer> round = offers.findByOpsOrderIdAndDispatchRound(o.getId(), o.getDispatchRound());
        round.stream().filter(x -> x.getSupplierOrgId().equals(supplierOrgId)).forEach(x -> x.decline(Instant.now()));
        offers.saveAllAndFlush(round);
        if (round.stream().noneMatch(x -> x.getStatus() == OpsOrderOffer.Status.OFFERED)) {
            o.backToAssembling();
            opsOrders.saveAndFlush(o);
        }
        return new DispatchViews.Declined(o.getId(), OpsOrderOffer.Status.DECLINED.name());
    }

    // ---------- 我的订单 ----------

    @Transactional(readOnly = true)
    public List<DispatchViews.SupplierOrderView> orders(UUID supplierOrgId) {
        List<SupplierOrder> list = supplierOrders.findBySupplierOrgIdOrderByAcceptedAtDesc(supplierOrgId);
        if (list.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<SupplierOrderPart>> partsByOrder = supplierParts.findBySupplierOrderIdIn(
                list.stream().map(SupplierOrder::getId).toList()).stream()
                .collect(Collectors.groupingBy(SupplierOrderPart::getSupplierOrderId));
        return list.stream().map(so -> orderView(so, partsByOrder.getOrDefault(so.getId(), List.of()))).toList();
    }

    @Transactional(readOnly = true)
    public DispatchViews.SupplierOrderView order(UUID supplierOrgId, UUID supplierOrderId) {
        SupplierOrder so = requireMine(supplierOrgId, supplierOrderId);
        return orderView(so, supplierParts.findBySupplierOrderIdOrderByCreatedAtAsc(so.getId()));
    }

    /** 供应商签字 = 锁定（文档 12 §4）。只有「待签」能签；签完退不了、改不了。 */
    @Transactional
    public DispatchViews.SupplierOrderView sign(UUID supplierOrgId, UUID userId, UUID supplierOrderId) {
        SupplierOrder peek = requireMine(supplierOrgId, supplierOrderId);
        opsOrders.lockById(peek.getOpsOrderId())
                .orElseThrow(() -> BusinessException.notFound("dispatch.supplier_order_not_found"));
        SupplierOrder so = requireMine(supplierOrgId, supplierOrderId);
        if (so.getStatus() != SupplierOrder.Status.CONTRACT_PENDING) {
            throw BusinessException.conflict("dispatch.supplier_order_not_pending");
        }
        so.sign(userId, Instant.now());
        supplierOrders.saveAndFlush(so);
        return orderView(so, supplierParts.findBySupplierOrderIdOrderByCreatedAtAsc(so.getId()));
    }

    /** 签字前退单（文档 12 §4）：供应商订单取消（WITHDRAWN），生产订单回组装中重派。签了就退不了。 */
    @Transactional
    public DispatchViews.SupplierOrderView withdraw(UUID supplierOrgId, UUID supplierOrderId) {
        SupplierOrder peek = requireMine(supplierOrgId, supplierOrderId);
        OpsOrder o = opsOrders.lockById(peek.getOpsOrderId())
                .orElseThrow(() -> BusinessException.notFound("dispatch.supplier_order_not_found"));
        SupplierOrder so = requireMine(supplierOrgId, supplierOrderId);
        if (so.isSigned()) {
            throw BusinessException.conflict("dispatch.contract_signed");
        }
        if (!so.isOpenBeforeSigning()) {
            throw BusinessException.conflict("dispatch.supplier_order_not_active");
        }
        so.cancel(SupplierOrder.CancelReason.WITHDRAWN, Instant.now());
        supplierOrders.saveAndFlush(so);
        o.backToAssembling();
        opsOrders.saveAndFlush(o);
        return orderView(so, supplierParts.findBySupplierOrderIdOrderByCreatedAtAsc(so.getId()));
    }

    // ---------- 看图（先校验再签 URL，落审计） ----------

    public ViewUrl offerFileViewUrl(UUID supplierOrgId, UUID userId, UUID opsOrderId, UUID lineId, UUID fileId) {
        OpsOrder o = requireOpen(opsOrders.findById(opsOrderId), supplierOrgId);
        OpsOrderPart p = opsParts.findById(lineId).filter(x -> x.getOpsOrderId().equals(o.getId()))
                .orElseThrow(() -> BusinessException.notFound("part.file_not_found"));
        return issue(supplierOrgId, userId, p.getUpstreamPartId(), fileId, PartFileAccessLog.ContextType.OPS_ORDER,
                o.getId());
    }

    public ViewUrl orderFileViewUrl(UUID supplierOrgId, UUID userId, UUID supplierOrderId, UUID lineId, UUID fileId) {
        SupplierOrder so = requireMine(supplierOrgId, supplierOrderId);
        if (so.getStatus() == SupplierOrder.Status.CANCELLED) {
            throw BusinessException.notFound("part.file_not_found");
        }
        SupplierOrderPart sp = supplierParts.findById(lineId).filter(x -> x.getSupplierOrderId().equals(so.getId()))
                .orElseThrow(() -> BusinessException.notFound("part.file_not_found"));
        OpsOrderPart p = opsParts.findById(sp.getUpstreamPartId())
                .orElseThrow(() -> BusinessException.notFound("part.file_not_found"));
        return issue(supplierOrgId, userId, p.getUpstreamPartId(), fileId,
                PartFileAccessLog.ContextType.SUPPLIER_ORDER, so.getId());
    }

    // ---------- helpers ----------

    /** 文件必须属于这一行锁定的图纸版本；审计里图纸归属记客户，访问方记供应商。 */
    private ViewUrl issue(UUID supplierOrgId, UUID userId, UUID customerOrderPartId, UUID fileId,
                          PartFileAccessLog.ContextType contextType, UUID contextId) {
        CustomerOrderPart line = customerLines.findById(customerOrderPartId)
                .orElseThrow(() -> BusinessException.notFound("part.file_not_found"));
        PartFile file = files.findByIdAndCustomerOrgId(fileId, line.getCustomerOrgId())
                .filter(f -> f.getPartRevisionId().equals(line.getPartRevisionId()))
                .orElseThrow(() -> BusinessException.notFound("part.file_not_found"));
        return drawings.issueViewUrl(line.getCustomerOrgId(), userId, PartyType.SUPPLIER, supplierOrgId, file.getId(),
                contextType, contextId);
    }

    private OpsOrder requireOpen(Optional<OpsOrder> found, UUID supplierOrgId) {
        return found.filter(o -> visibility.isOpenTo(o, supplierOrgId))
                .orElseThrow(() -> BusinessException.notFound("dispatch.offer_not_found"));
    }

    private SupplierOrder requireMine(UUID supplierOrgId, UUID supplierOrderId) {
        return supplierOrders.findByIdAndSupplierOrgId(supplierOrderId, supplierOrgId)
                .orElseThrow(() -> BusinessException.notFound("dispatch.supplier_order_not_found"));
    }

    private DispatchViews.SupplierOrderView orderView(SupplierOrder so, List<SupplierOrderPart> ps) {
        Map<UUID, UUID> upstreamCustomerLine = opsParts.findAllById(
                        ps.stream().map(SupplierOrderPart::getUpstreamPartId).toList()).stream()
                .collect(Collectors.toMap(OpsOrderPart::getId, OpsOrderPart::getUpstreamPartId));
        List<DispatchViews.SupplierLine> lines = details.forSupplier(ps.stream()
                .map(sp -> new DispatchLineDetails.Row(sp.getId(), upstreamCustomerLine.get(sp.getUpstreamPartId()),
                        sp.getQuantity()))
                .toList());
        return new DispatchViews.SupplierOrderView(so.getId(), so.getOpsOrderId(), so.getStatus().name(),
                so.getSupplierDueDate(), so.getAcceptedAt(), so.getContractCreatedAt(), so.getSignedAt(),
                signDeadline.deadlineOf(so.getAcceptedAt()), so.getCancelledAt(),
                so.getCancelReason() == null ? null : so.getCancelReason().name(), lines);
    }
}
