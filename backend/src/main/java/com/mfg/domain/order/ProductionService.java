package com.mfg.domain.order;

import com.mfg.common.exception.BusinessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 生产进度 + 质检（2026-09-20 需求方拍板，设计文档 12 §1 §5 §7 §8）。
 *
 * <p>供应商报<b>开工 / 完工</b>（不报件数），整单全部完工才能发给平台；运营收货后<b>按件数</b>判
 * 合格 / 返工 / 报废，三个数之和必须等于该行件数。返工和报废件从原行拆出来另开一行，在同一张供应商订单里
 * 从头再走 —— 成本供应商自担，所以不写新的对供价快照。报废件的补料本轮只做<b>原厂重做</b>。
 *
 * <p>★ 状态只存在叶子零件行上。供应商订单 / 生产订单 / 客户订单的状态都是每次操作后<b>在同一个事务里</b>
 * 从叶子行重算回写（{@link #rollUp}）—— 不在读的时候现算，客户端要按它筛。
 *
 * <p>并发：每个写操作都先 {@code FOR UPDATE} 锁生产订单那一行（和接单 / 签字 / 退单同一把锁、同一个顺序），
 * 锁住之后再重读零件行判状态，所以同一行的两次开工 / 两次质检只有一个能成。
 */
@Service
class ProductionService {

    /** 供应商还得干活的行：这些行没清空之前，整单发不了货（2026-09-20：整单全部完工才能发）。 */
    private static final Set<SupplierOrderPart.FulfillmentStatus> UNFINISHED = Set.of(
            SupplierOrderPart.FulfillmentStatus.PENDING, SupplierOrderPart.FulfillmentStatus.IN_PRODUCTION);

    private final OpsOrderRepository opsOrders;
    private final OpsOrderPartRepository opsParts;
    private final SupplierOrderRepository supplierOrders;
    private final SupplierOrderPartRepository supplierParts;
    private final CustomerOrderRepository customerOrders;
    private final CustomerOrderPartRepository customerLines;
    private final SupplierOrderViews views;

    ProductionService(OpsOrderRepository opsOrders, OpsOrderPartRepository opsParts,
                      SupplierOrderRepository supplierOrders, SupplierOrderPartRepository supplierParts,
                      CustomerOrderRepository customerOrders, CustomerOrderPartRepository customerLines,
                      SupplierOrderViews views) {
        this.opsOrders = opsOrders;
        this.opsParts = opsParts;
        this.supplierOrders = supplierOrders;
        this.supplierParts = supplierParts;
        this.customerOrders = customerOrders;
        this.customerLines = customerLines;
        this.views = views;
    }

    /** 质检一行的判定：三个数之和必须等于该行件数。 */
    record QcInput(int pass, int rework, int scrap) {
    }

    // ---------- 供应商：开工 / 完工 / 发货 ----------

    @Transactional
    public DispatchViews.SupplierOrderView start(UUID supplierOrgId, UUID supplierOrderId, UUID lineId) {
        SupplierOrder so = lockSigned(supplierOrgId, supplierOrderId);
        SupplierOrderPart line = requireLine(so, lineId);
        if (line.getFulfillmentStatus() != SupplierOrderPart.FulfillmentStatus.PENDING) {
            throw BusinessException.conflict("production.line_not_pending");
        }
        line.start(Instant.now());
        supplierParts.saveAndFlush(line);
        return views.forSupplier(so, rollUp(so));
    }

    @Transactional
    public DispatchViews.SupplierOrderView produced(UUID supplierOrgId, UUID supplierOrderId, UUID lineId) {
        SupplierOrder so = lockSigned(supplierOrgId, supplierOrderId);
        SupplierOrderPart line = requireLine(so, lineId);
        if (line.getFulfillmentStatus() != SupplierOrderPart.FulfillmentStatus.IN_PRODUCTION) {
            throw BusinessException.conflict("production.line_not_started");
        }
        line.produce(Instant.now());
        supplierParts.saveAndFlush(line);
        return views.forSupplier(so, rollUp(so));
    }

    /**
     * 发给平台：把已完工的行整批发出去。
     *
     * <p>2026-09-20 拍板「整单全部完工才能发」—— 所以只要还有行在待开工 / 生产中就拒。
     * 返工和重做的行做完之后再点一次，发的就是那几行。
     */
    @Transactional
    public DispatchViews.SupplierOrderView ship(UUID supplierOrgId, UUID supplierOrderId) {
        SupplierOrder so = lockSigned(supplierOrgId, supplierOrderId);
        List<SupplierOrderPart> parts = supplierParts.findBySupplierOrderIdOrderByCreatedAtAsc(so.getId());
        if (parts.stream().anyMatch(p -> UNFINISHED.contains(p.getFulfillmentStatus()))) {
            throw BusinessException.conflict("production.lines_unfinished");
        }
        List<SupplierOrderPart> ready = parts.stream()
                .filter(p -> p.getFulfillmentStatus() == SupplierOrderPart.FulfillmentStatus.PRODUCED).toList();
        if (ready.isEmpty()) {
            throw BusinessException.conflict("production.nothing_to_ship");
        }
        Instant now = Instant.now();
        ready.forEach(p -> p.ship(now));
        supplierParts.saveAllAndFlush(ready);
        return views.forSupplier(so, rollUp(so));
    }

    // ---------- 运营：看生产 / 质检 / 原厂重做 ----------

    /** 已签字之后的供应商订单（生产中 / 待质检 / 已完成），最近接单的在前。 */
    @Transactional(readOnly = true)
    public List<DispatchViews.OpsProductionOrder> list() {
        List<SupplierOrder> orders = supplierOrders.findByStatusInOrderByAcceptedAtDesc(
                Set.of(SupplierOrder.Status.CONTRACTED, SupplierOrder.Status.IN_PRODUCTION,
                        SupplierOrder.Status.SHIPPED, SupplierOrder.Status.FULFILLED));
        if (orders.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<SupplierOrderPart>> partsByOrder = supplierParts.findBySupplierOrderIdIn(
                        orders.stream().map(SupplierOrder::getId).toList()).stream()
                .collect(Collectors.groupingBy(SupplierOrderPart::getSupplierOrderId));
        return orders.stream()
                .map(so -> views.forOps(so, sorted(partsByOrder.getOrDefault(so.getId(), List.of()))))
                .toList();
    }

    /**
     * 质检一行：合格 N / 返工 M / 报废 K，三个数之和必须等于该行件数。
     *
     * <p>合格件留在原行；返工件另开一行从 PENDING 重走；报废件另开一行记着（等运营点原厂重做）。
     * 合格 0 件时原行件数不动、状态改成已被替代 —— 库里 quantity 的 CHECK 是 >= 1，减不到 0。
     */
    @Transactional
    public DispatchViews.OpsProductionOrder qc(UUID supplierOrderId, UUID lineId, QcInput input) {
        SupplierOrder so = lockForOps(supplierOrderId);
        SupplierOrderPart line = requireLine(so, lineId);
        if (line.getFulfillmentStatus() != SupplierOrderPart.FulfillmentStatus.QC_PENDING) {
            throw BusinessException.conflict("production.line_not_shipped");
        }
        if (input.pass() < 0 || input.rework() < 0 || input.scrap() < 0
                || input.pass() + input.rework() + input.scrap() != line.getQuantity()) {
            throw BusinessException.badRequest("production.qc_quantity_mismatch");
        }
        Instant now = Instant.now();
        List<SupplierOrderPart> created = new ArrayList<>();
        if (input.rework() > 0) {
            created.add(SupplierOrderPart.splitFrom(line, input.rework(),
                    SupplierOrderPart.FulfillmentStatus.PENDING, now));
        }
        if (input.scrap() > 0) {
            created.add(SupplierOrderPart.splitFrom(line, input.scrap(),
                    SupplierOrderPart.FulfillmentStatus.SCRAPPED, now));
        }
        supplierParts.saveAllAndFlush(created);
        if (input.pass() > 0) {
            line.qcPassed(input.pass(), now);
        } else {
            line.supersede(created.get(0).getId(), now);
        }
        supplierParts.saveAndFlush(line);
        return views.forOps(so, rollUp(so));
    }

    /** 报废件原厂重做（2026-09-20：本轮只做这一种补料）：同一张单开一行新的，不加钱。 */
    @Transactional
    public DispatchViews.OpsProductionOrder remake(UUID supplierOrderId, UUID lineId) {
        SupplierOrder so = lockForOps(supplierOrderId);
        SupplierOrderPart line = requireLine(so, lineId);
        if (!line.isScrapAwaitingRemake()) {
            throw BusinessException.conflict("production.line_not_scrapped");
        }
        SupplierOrderPart remade = supplierParts.saveAndFlush(SupplierOrderPart.splitFrom(line, line.getQuantity(),
                SupplierOrderPart.FulfillmentStatus.PENDING, Instant.now()));
        line.remadeBy(remade.getId());
        supplierParts.saveAndFlush(line);
        return views.forOps(so, rollUp(so));
    }

    // ---------- 回写：叶子行 → 供应商订单 → 生产订单 → 客户零件行 → 客户订单 ----------

    /** 重算这张单的进度并往上回写，返回排好序的叶子行（视图直接用）。 */
    private List<SupplierOrderPart> rollUp(SupplierOrder so) {
        List<SupplierOrderPart> parts = sorted(supplierParts.findBySupplierOrderIdOrderByCreatedAtAsc(so.getId()));
        SupplierOrder.Status next = supplierOrderStatus(parts);
        if (next != so.getStatus()) {
            so.moveTo(next);
            supplierOrders.saveAndFlush(so);
        }
        opsOrders.findById(so.getOpsOrderId()).ifPresent(o -> {
            OpsOrder.Status want = next == SupplierOrder.Status.FULFILLED
                    ? OpsOrder.Status.FULFILLED : OpsOrder.Status.ASSIGNED;
            if (o.getStatus() != want) {
                o.moveTo(want);
                opsOrders.saveAndFlush(o);
            }
        });
        rollUpCustomerLines(parts);
        return parts;
    }

    /**
     * 供应商订单的状态就是叶子行的汇总：
     * 全是待开工 → 还是「已签字」；全部合格 → 「已完成」；没活要干也没报废等补料 → 「已发到平台」；否则「生产中」。
     */
    private SupplierOrder.Status supplierOrderStatus(List<SupplierOrderPart> parts) {
        if (parts.isEmpty()) {
            return SupplierOrder.Status.CONTRACTED;
        }
        boolean anyUnfinished = parts.stream().anyMatch(p -> UNFINISHED.contains(p.getFulfillmentStatus()));
        boolean anyProduced = parts.stream()
                .anyMatch(p -> p.getFulfillmentStatus() == SupplierOrderPart.FulfillmentStatus.PRODUCED);
        boolean anyAwaitingQc = parts.stream()
                .anyMatch(p -> p.getFulfillmentStatus() == SupplierOrderPart.FulfillmentStatus.QC_PENDING);
        boolean anyPendingScrap = parts.stream().anyMatch(SupplierOrderPart::isScrapAwaitingRemake);
        boolean notStartedYet = parts.stream()
                .allMatch(p -> p.getFulfillmentStatus() == SupplierOrderPart.FulfillmentStatus.PENDING);
        if (notStartedYet) {
            return SupplierOrder.Status.CONTRACTED;
        }
        if (anyUnfinished || anyProduced || anyPendingScrap) {
            return SupplierOrder.Status.IN_PRODUCTION;
        }
        return anyAwaitingQc ? SupplierOrder.Status.SHIPPED : SupplierOrder.Status.FULFILLED;
    }

    /**
     * 客户零件行只有四态（文档 12 §7）：全部合格 = 已完成；只要有一行动过 = 进行中；否则待安排。
     * 返工、报废、供应商侧的波折都折进「进行中」—— 客户看不到，也不该看到。
     */
    private void rollUpCustomerLines(List<SupplierOrderPart> parts) {
        Set<UUID> customerPartIds = opsParts.findAllById(
                        parts.stream().map(SupplierOrderPart::getUpstreamPartId).collect(Collectors.toSet())).stream()
                .map(OpsOrderPart::getUpstreamPartId).collect(Collectors.toSet());
        if (customerPartIds.isEmpty()) {
            return;
        }
        List<CustomerOrderPart> lines = customerLines.findByIdIn(customerPartIds);
        Map<UUID, List<SupplierOrderPart>> leavesByCustomerLine = leavesOf(customerPartIds);
        for (CustomerOrderPart line : lines) {
            List<SupplierOrderPart> leaves = leavesByCustomerLine.getOrDefault(line.getId(), List.of());
            int passed = leaves.stream()
                    .filter(p -> p.getFulfillmentStatus() == SupplierOrderPart.FulfillmentStatus.QC_PASSED)
                    .mapToInt(SupplierOrderPart::getQuantity).sum();
            CustomerOrderPart.FulfillmentStatus want;
            if (passed >= line.getQuantity()) {
                want = CustomerOrderPart.FulfillmentStatus.FULFILLED;
            } else if (leaves.stream()
                    .anyMatch(p -> p.getFulfillmentStatus() != SupplierOrderPart.FulfillmentStatus.PENDING)) {
                want = CustomerOrderPart.FulfillmentStatus.IN_PROGRESS;
            } else {
                want = CustomerOrderPart.FulfillmentStatus.PENDING;
            }
            if (line.getFulfillmentStatus() != want) {
                line.moveTo(want);
                customerLines.saveAndFlush(line);
            }
        }
        lines.stream()
                .collect(Collectors.toMap(CustomerOrderPart::getCustomerOrderId, CustomerOrderPart::getCustomerOrgId,
                        (a, b) -> a))
                .forEach(this::rollUpCustomerOrder);
    }

    /** 一张客户订单的零件行全部完成 → 待发货（发给客户是下一轮的事）。 */
    private void rollUpCustomerOrder(UUID customerOrderId, UUID customerOrgId) {
        List<CustomerOrderPart> all = customerLines.findByCustomerOrderIdAndCustomerOrgIdOrderByCreatedAtAsc(
                customerOrderId, customerOrgId);
        boolean done = !all.isEmpty() && all.stream()
                .allMatch(l -> l.getFulfillmentStatus() == CustomerOrderPart.FulfillmentStatus.FULFILLED);
        if (done) {
            customerOrders.transitionStatus(customerOrderId, customerOrgId, CustomerOrder.Status.CONFIRMED,
                    CustomerOrder.Status.READY, Instant.now());
        }
    }

    /** 某几个客户零件行下面挂着的所有叶子行（顺着 客户行 ← 生产订单行 ← 供应商订单行 两跳找）。 */
    private Map<UUID, List<SupplierOrderPart>> leavesOf(Set<UUID> customerPartIds) {
        Map<UUID, UUID> opsToCustomer = opsParts.findByUpstreamPartIdIn(customerPartIds).stream()
                .collect(Collectors.toMap(OpsOrderPart::getId, OpsOrderPart::getUpstreamPartId));
        if (opsToCustomer.isEmpty()) {
            return Map.of();
        }
        return supplierParts.findByUpstreamPartIdIn(opsToCustomer.keySet()).stream()
                .collect(Collectors.groupingBy(p -> opsToCustomer.get(p.getUpstreamPartId())));
    }

    // ---------- helpers ----------

    /** 供应商的写操作：先锁生产订单（和接单 / 签字同一把锁、同一个顺序），再判这张单已签字。 */
    private SupplierOrder lockSigned(UUID supplierOrgId, UUID supplierOrderId) {
        SupplierOrder peek = supplierOrders.findByIdAndSupplierOrgId(supplierOrderId, supplierOrgId)
                .orElseThrow(() -> BusinessException.notFound("dispatch.supplier_order_not_found"));
        opsOrders.lockById(peek.getOpsOrderId())
                .orElseThrow(() -> BusinessException.notFound("dispatch.supplier_order_not_found"));
        SupplierOrder so = supplierOrders.findByIdAndSupplierOrgId(supplierOrderId, supplierOrgId)
                .orElseThrow(() -> BusinessException.notFound("dispatch.supplier_order_not_found"));
        if (!so.isSigned()) {
            throw BusinessException.conflict("production.order_not_signed");
        }
        return so;
    }

    /** 运营的写操作：同样先锁生产订单。运营跨客户跨供应商，没有归属条件。 */
    private SupplierOrder lockForOps(UUID supplierOrderId) {
        SupplierOrder peek = supplierOrders.findById(supplierOrderId)
                .orElseThrow(() -> BusinessException.notFound("dispatch.supplier_order_not_found"));
        opsOrders.lockById(peek.getOpsOrderId())
                .orElseThrow(() -> BusinessException.notFound("dispatch.ops_order_not_found"));
        SupplierOrder so = supplierOrders.findById(supplierOrderId).orElseThrow();
        if (!so.isSigned()) {
            throw BusinessException.conflict("production.order_not_signed");
        }
        return so;
    }

    private SupplierOrderPart requireLine(SupplierOrder so, UUID lineId) {
        return supplierParts.findById(lineId).filter(p -> p.getSupplierOrderId().equals(so.getId()))
                .orElseThrow(() -> BusinessException.notFound("production.line_not_found"));
    }

    /** 拆出来的新行紧跟在原行后面，前端不用自己排。 */
    private static List<SupplierOrderPart> sorted(List<SupplierOrderPart> parts) {
        Map<UUID, SupplierOrderPart> byId = parts.stream()
                .collect(Collectors.toMap(SupplierOrderPart::getId, Function.identity()));
        return parts.stream().sorted(Comparator.comparing((SupplierOrderPart p) -> rootOf(p, byId).getCreatedAt())
                .thenComparing(SupplierOrderPart::getCreatedAt)).toList();
    }

    private static SupplierOrderPart rootOf(SupplierOrderPart part, Map<UUID, SupplierOrderPart> byId) {
        SupplierOrderPart cur = part;
        for (int hop = 0; hop < 20 && cur.getReplacesPartId() != null; hop++) {
            SupplierOrderPart parent = byId.get(cur.getReplacesPartId());
            if (parent == null) {
                break;
            }
            cur = parent;
        }
        return cur;
    }
}
