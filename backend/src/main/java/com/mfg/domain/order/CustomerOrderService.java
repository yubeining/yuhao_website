package com.mfg.domain.order;

import com.mfg.common.dto.PagedResponse;
import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.PartyType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 客户订单：草稿 → 加零件行 → 提交（2026-09-14 拍板，设计文档 12 §2）。
 *
 * <p><b>每个方法都显式收 {@code customerOrgId}</b>（§3 铁律 1），所有查询都带这个条件（§3 铁律 2）。
 * 别人的订单一律 404。
 *
 * <p>业务规则：
 * <ul>
 *   <li>草稿才能改；客户只能取消草稿。</li>
 *   <li>提交条件：每行至少有一份传完的图纸。提交时锁定各行的图纸版本。</li>
 *   <li>加行时图号命中已有零件（D16）→ 挂它最近一次被锁定的版本；没有锁定过的版本或没有这个零件 → 开新版本 / 新零件。</li>
 * </ul>
 *
 * <p><b>并发</b>（2026-09-15 修）：改订单的操作都先锁订单行（{@link #requireDraft}）；
 * 提交在锁住订单之后、检查图纸之前，再锁住各行的图纸版本。改文件的操作也锁版本。
 * 加锁顺序固定为「订单 → 版本」，文件操作只锁单个版本，所以不会死锁。
 * 修之前「提交」和「加行」「删最后一份图纸」都能交错成功，并发测试第一轮就复现。
 */
@Service
class CustomerOrderService {

    private final CustomerOrderRepository orders;
    private final CustomerOrderPartRepository lines;
    private final PartDesignRepository parts;
    private final PartRevisionRepository revisions;
    private final PartFileRepository files;
    private final PartDrawingService drawings;

    CustomerOrderService(CustomerOrderRepository orders, CustomerOrderPartRepository lines,
                         PartDesignRepository parts, PartRevisionRepository revisions,
                         PartFileRepository files, PartDrawingService drawings) {
        this.orders = orders;
        this.lines = lines;
        this.parts = parts;
        this.revisions = revisions;
        this.files = files;
        this.drawings = drawings;
    }

    // ---------- 订单 ----------

    @Transactional
    public OrderView create(UUID customerOrgId, UUID userId, String title, Integer wantedLeadDays) {
        CustomerOrder saved = orders.save(new CustomerOrder(customerOrgId, userId, blankToNull(title), wantedLeadDays));
        return view(customerOrgId, saved);
    }

    @Transactional(readOnly = true)
    public PagedResponse<OrderSummaryView> list(UUID customerOrgId, Pageable pageable) {
        Page<CustomerOrder> page = orders.findByCustomerOrgId(customerOrgId, pageable);
        Map<UUID, long[]> counts = new HashMap<>();
        if (page.hasContent()) {
            for (Object[] row : lines.summarize(page.map(CustomerOrder::getId).getContent(), customerOrgId)) {
                counts.put((UUID) row[0], new long[] {((Number) row[1]).longValue(), ((Number) row[2]).longValue()});
            }
        }
        return PagedResponse.of(page, o -> {
            long[] c = counts.getOrDefault(o.getId(), new long[] {0, 0});
            return new OrderSummaryView(o.getId(), o.getTitle(), o.getStatus().name(), o.getWantedLeadDays(),
                    c[0], c[1], o.getCreatedAt(), o.getSubmittedAt());
        });
    }

    @Transactional(readOnly = true)
    public OrderView get(UUID customerOrgId, UUID orderId) {
        return view(customerOrgId, requireOrder(customerOrgId, orderId));
    }

    @Transactional
    public OrderView updateDraft(UUID customerOrgId, UUID orderId, String title, Integer wantedLeadDays) {
        CustomerOrder order = requireDraft(customerOrgId, orderId);
        order.updateDraft(blankToNull(title), wantedLeadDays);
        return view(customerOrgId, orders.saveAndFlush(order));
    }

    /**
     * 每行都要有传完的图纸 → 状态改成 SUBMITTED → 锁定各行版本。任何一步不过，整个事务回滚。
     *
     * <p>★ 顺序不能换：先锁订单（挡住并发的加 / 改 / 删行），读零件行；再锁各行版本（挡住并发的删图纸），
     * 最后才检查图纸。检查放在两把锁都拿到之后，读到的就是提交那一刻的真实状态。
     */
    @Transactional
    public OrderView submit(UUID customerOrgId, UUID orderId) {
        requireDraft(customerOrgId, orderId);
        List<CustomerOrderPart> orderLines =
                lines.findByCustomerOrderIdAndCustomerOrgIdOrderByCreatedAtAsc(orderId, customerOrgId);
        if (orderLines.isEmpty()) {
            throw BusinessException.conflict("order.no_lines");
        }
        Set<UUID> revisionIds = orderLines.stream().map(CustomerOrderPart::getPartRevisionId).collect(Collectors.toSet());
        revisions.lockAllByIdIn(revisionIds, customerOrgId);
        Set<UUID> withDrawing = Set.copyOf(
                files.findRevisionIdsHavingStatus(revisionIds, customerOrgId, PartFile.UploadStatus.COMPLETED));
        List<UUID> missing = orderLines.stream()
                .filter(l -> !withDrawing.contains(l.getPartRevisionId()))
                .map(CustomerOrderPart::getId)
                .toList();
        if (!missing.isEmpty()) {
            throw new BusinessException(409, "order.line_missing_drawing", missing);
        }
        Instant now = Instant.now();
        if (orders.transition(orderId, customerOrgId, CustomerOrder.Status.DRAFT, CustomerOrder.Status.SUBMITTED,
                now, now) != 1) {
            // 并发提交：别的请求先一步改了
            throw BusinessException.conflict("order.not_draft");
        }
        revisions.lockAll(revisionIds, customerOrgId, now);
        return get(customerOrgId, orderId);
    }

    /** 只能取消草稿（设计文档 12 §2 已拍板）。 */
    @Transactional
    public OrderView cancel(UUID customerOrgId, UUID orderId) {
        requireDraft(customerOrgId, orderId);
        Instant now = Instant.now();
        if (orders.transition(orderId, customerOrgId, CustomerOrder.Status.DRAFT, CustomerOrder.Status.CANCELLED,
                null, now) != 1) {
            throw BusinessException.conflict("order.not_draft");
        }
        return get(customerOrgId, orderId);
    }

    // ---------- 零件行 ----------

    /**
     * 图号命中本客户已有零件（D16）→ 挂它最近一次被锁定的版本（再次下单沿用上次图纸，2026-09-14 拍板）；
     * 这个零件从没被提交锁定过 → 给这张订单开一个新版本；没有这个零件 → 建零件 + 第 1 版。
     */
    @Transactional
    public OrderLineView addLine(UUID customerOrgId, UUID userId, UUID orderId, String code, String name, int quantity,
                                 String material, String surfaceTreatment, String customerRev) {
        requireDraft(customerOrgId, orderId);
        String trimmedCode = code.trim();
        String trimmedName = name.trim();
        PartDesign part = parts.findByCustomerOrgIdAndCode(customerOrgId, trimmedCode).orElse(null);
        PartRevision revision;
        if (part == null) {
            part = drawings.insertPart(customerOrgId, trimmedCode, trimmedName);
            revision = drawings.insertNextRevision(customerOrgId, userId, part.getId(), blankToNull(customerRev));
        } else {
            UUID partId = part.getId();
            revision = revisions.findTopByPartDesignIdAndCustomerOrgIdAndLockedAtIsNotNullOrderByRevNoDesc(
                            partId, customerOrgId)
                    .orElseGet(() -> drawings.insertNextRevision(customerOrgId, userId, partId, blankToNull(customerRev)));
        }
        // part_no 的编号规则至今没定：先填一个不重复的占位值，界面上不显示
        CustomerOrderPart line = lines.save(new CustomerOrderPart(orderId, customerOrgId, part.getId(), revision.getId(),
                UUID.randomUUID().toString(), trimmedName, quantity, blankToNull(material), blankToNull(surfaceTreatment)));
        return lineView(customerOrgId, line, part, revision);
    }

    @Transactional
    public OrderLineView updateLine(UUID customerOrgId, UUID orderId, UUID lineId, String name, int quantity,
                                    String material, String surfaceTreatment) {
        requireDraft(customerOrgId, orderId);
        CustomerOrderPart line = requireLine(customerOrgId, orderId, lineId);
        line.updateDraft(name.trim(), quantity, blankToNull(material), blankToNull(surfaceTreatment));
        return lineView(customerOrgId, lines.saveAndFlush(line));
    }

    /** 草稿行没有任何下游引用，物理删除。 */
    @Transactional
    public OrderView removeLine(UUID customerOrgId, UUID orderId, UUID lineId) {
        requireDraft(customerOrgId, orderId);
        lines.delete(requireLine(customerOrgId, orderId, lineId));
        return get(customerOrgId, orderId);
    }

    /** 「换图纸」：这一行挂的版本已被锁定时，开一个新版本并改挂过去。没锁定的直接增删文件即可。 */
    @Transactional
    public OrderLineView startNewRevision(UUID customerOrgId, UUID userId, UUID orderId, UUID lineId,
                                          String customerRev) {
        requireDraft(customerOrgId, orderId);
        CustomerOrderPart line = requireLine(customerOrgId, orderId, lineId);
        PartRevision current = revisions.findByIdAndCustomerOrgId(line.getPartRevisionId(), customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("part.revision_not_found"));
        if (!current.isLocked()) {
            throw BusinessException.conflict("part.revision_not_locked");
        }
        PartRevision next = drawings.insertNextRevision(customerOrgId, userId, line.getPartDesignId(),
                blankToNull(customerRev));
        line.repointRevision(next.getId());
        return lineView(customerOrgId, lines.saveAndFlush(line));
    }

    // ---------- 在订单里看图（红线 1，带业务上下文） ----------

    /**
     * 先校验「这张订单是你的、这一行是这张订单的、这个文件属于这一行锁定的版本」，再签 URL 并记审计。
     * 任何一环对不上都是 404，且不落审计 —— 不许拿假上下文污染审计记录。
     */
    public ViewUrl lineFileViewUrl(UUID customerOrgId, UUID accessorUserId, PartyType accessorPartyType,
                                   UUID orderId, UUID lineId, UUID fileId) {
        requireOrder(customerOrgId, orderId);
        CustomerOrderPart line = requireLine(customerOrgId, orderId, lineId);
        PartFile file = files.findByIdAndCustomerOrgId(fileId, customerOrgId)
                .filter(f -> f.getPartRevisionId().equals(line.getPartRevisionId()))
                .orElseThrow(() -> BusinessException.notFound("part.file_not_found"));
        return drawings.issueViewUrl(customerOrgId, accessorUserId, accessorPartyType, customerOrgId, file.getId(),
                PartFileAccessLog.ContextType.CUSTOMER_ORDER, orderId);
    }

    // ---------- helpers ----------

    private OrderView view(UUID customerOrgId, CustomerOrder order) {
        List<CustomerOrderPart> orderLines =
                lines.findByCustomerOrderIdAndCustomerOrgIdOrderByCreatedAtAsc(order.getId(), customerOrgId);
        List<OrderLineView> views = lineViews(customerOrgId, orderLines);
        return new OrderView(order.getId(), order.getTitle(), order.getStatus().name(), order.getWantedLeadDays(),
                order.getCreatedAt(), order.getSubmittedAt(), views);
    }

    private List<OrderLineView> lineViews(UUID customerOrgId, List<CustomerOrderPart> orderLines) {
        if (orderLines.isEmpty()) {
            return List.of();
        }
        Set<UUID> revisionIds = orderLines.stream().map(CustomerOrderPart::getPartRevisionId).collect(Collectors.toSet());
        Set<UUID> partIds = orderLines.stream().map(CustomerOrderPart::getPartDesignId).collect(Collectors.toSet());
        Map<UUID, PartRevision> revById = revisions.findByIdInAndCustomerOrgId(revisionIds, customerOrgId).stream()
                .collect(Collectors.toMap(PartRevision::getId, Function.identity()));
        Map<UUID, PartDesign> partById = parts.findByIdInAndCustomerOrgId(partIds, customerOrgId).stream()
                .collect(Collectors.toMap(PartDesign::getId, Function.identity()));
        Map<UUID, List<FileView>> filesByRevision = drawings.completedFilesByRevision(customerOrgId, revisionIds);
        return orderLines.stream()
                .map(l -> toLineView(l, partById.get(l.getPartDesignId()), revById.get(l.getPartRevisionId()),
                        filesByRevision.getOrDefault(l.getPartRevisionId(), List.of())))
                .toList();
    }

    private OrderLineView lineView(UUID customerOrgId, CustomerOrderPart line) {
        return lineViews(customerOrgId, List.of(line)).getFirst();
    }

    private OrderLineView lineView(UUID customerOrgId, CustomerOrderPart line, PartDesign part, PartRevision revision) {
        return toLineView(line, part, revision,
                drawings.completedFilesByRevision(customerOrgId, List.of(revision.getId()))
                        .getOrDefault(revision.getId(), List.of()));
    }

    private static OrderLineView toLineView(CustomerOrderPart line, PartDesign part, PartRevision revision,
                                            List<FileView> revisionFiles) {
        return new OrderLineView(line.getId(), line.getPartDesignId(), part.getCode(), line.getPartName(),
                line.getQuantity(), line.getMaterial(), line.getSurfaceTreatment(),
                RevisionView.of(revision, revisionFiles));
    }

    private CustomerOrder requireOrder(UUID customerOrgId, UUID orderId) {
        return orders.findByIdAndCustomerOrgId(orderId, customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("order.not_found"));
    }

    /** 带行锁取订单并要求是草稿。只在写操作的事务里调：锁到事务结束，同一张订单的写操作排队。 */
    private CustomerOrder requireDraft(UUID customerOrgId, UUID orderId) {
        CustomerOrder order = orders.lockByIdAndCustomerOrgId(orderId, customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("order.not_found"));
        if (order.getStatus() != CustomerOrder.Status.DRAFT) {
            throw BusinessException.conflict("order.not_draft");
        }
        return order;
    }

    private CustomerOrderPart requireLine(UUID customerOrgId, UUID orderId, UUID lineId) {
        return lines.findByIdAndCustomerOrderIdAndCustomerOrgId(lineId, orderId, customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("order.line_not_found"));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
