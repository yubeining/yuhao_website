package com.mfg.domain.order;

import com.mfg.common.dto.PagedResponse;
import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.PartyType;
import com.mfg.platform.identity.OrganizationRepository;
import com.mfg.platform.storage.StorageService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
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
 *   <li>草稿才能改，整张一次保存（2026-11-27）；客户只能取消草稿。</li>
 *   <li>草稿里的行可以没填齐；提交条件：每行有图号、名称、数量和至少一份传完的图纸。提交时锁定各行的图纸版本。</li>
 *   <li>每加一行都是新零件 + 第 1 版，图号不唯一（2026-11-26，取代 D16）。</li>
 * </ul>
 *
 * <p><b>并发</b>（2026-09-15 修）：改订单的操作都先锁订单行（{@link #requireDraft}）；
 * 提交在锁住订单之后、检查图纸之前，再锁住各行的图纸版本。改文件的操作也锁版本。
 * 加锁顺序固定为「订单 → 版本」，文件操作只锁单个版本，所以不会死锁。
 * 修之前「提交」和「加行」「删最后一份图纸」都能交错成功，并发测试第一轮就复现。
 */
@Service
class CustomerOrderService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(CustomerOrderService.class);

    /** 收货地址能改的状态：就绪（READY）之前（2026-11-23 拍板「发货前都能改」，系统里发货前的最后一个状态是 READY）。 */
    private static final Set<CustomerOrder.Status> SHIP_TO_EDITABLE = Set.of(CustomerOrder.Status.DRAFT,
            CustomerOrder.Status.SUBMITTED, CustomerOrder.Status.QUOTED, CustomerOrder.Status.CONFIRMED);

    private final CustomerOrderRepository orders;
    private final CustomerOrderPartRepository lines;
    private final PartDesignRepository parts;
    private final PartRevisionRepository revisions;
    private final PartFileRepository files;
    private final PartDrawingService drawings;
    private final OrganizationRepository organizations;
    private final PartFileAccessLogRepository accessLogs;
    private final StorageService storage;
    private final CustomerOrderDocumentRepository documents;

    CustomerOrderService(CustomerOrderRepository orders, CustomerOrderPartRepository lines,
                         PartDesignRepository parts, PartRevisionRepository revisions,
                         PartFileRepository files, PartDrawingService drawings,
                         OrganizationRepository organizations,
                         PartFileAccessLogRepository accessLogs, StorageService storage,
                         CustomerOrderDocumentRepository documents) {
        this.orders = orders;
        this.lines = lines;
        this.parts = parts;
        this.revisions = revisions;
        this.files = files;
        this.drawings = drawings;
        this.organizations = organizations;
        this.accessLogs = accessLogs;
        this.storage = storage;
        this.documents = documents;
    }

    // ---------- 订单 ----------

    /** 整张订单的输入（2026-11-27：订单页整页编辑，一次保存）。{@code shipTo} 为空 = 没填地址。 */
    record Draft(String title, LocalDate wantedDate, ShipTo shipTo, List<DraftLine> lines) {
    }

    /**
     * 一行的输入。{@code id} 为空 = 新行。草稿里图号 / 名称 / 数量都可以空着，提交时才检查（2026-11-27）。
     * {@code removeFileIds}：这一行要删的图纸。
     */
    record DraftLine(UUID id, String code, String name, Integer quantity, String material, String surfaceTreatment,
                     String customerRev, List<UUID> removeFileIds) {
    }

    /**
     * 第一次保存才建单（2026-11-27）：名称、交期、地址、零件在同一个事务里落库，任何一处出错都不留下订单。
     * 默认收货地址由前端预先带上，服务端不再自动填。
     */
    @Transactional
    public SavedOrderView create(UUID customerOrgId, UUID userId, Draft draft) {
        CustomerOrder order = new CustomerOrder(customerOrgId, userId, blankToNull(draft.title()), draft.wantedDate());
        if (draft.shipTo() != null) {
            order.replaceShipTo(draft.shipTo());
        }
        CustomerOrder saved = orders.saveAndFlush(order);
        List<UUID> created = new ArrayList<>();
        for (DraftLine input : draft.lines()) {
            if (input.id() != null) {
                throw BusinessException.notFound("order.line_not_found");
            }
            if (!input.removeFileIds().isEmpty()) {
                throw BusinessException.notFound("part.file_not_found");
            }
            created.add(insertLine(customerOrgId, userId, saved.getId(), input).getId());
        }
        return new SavedOrderView(view(customerOrgId, saved), created);
    }

    /**
     * 保存草稿：整张替换，一个事务（2026-11-27）。带 id 的行按新内容更新，没 id 的新建，没带到的已有行删掉；
     * 要删的图纸也在这个事务里删（对象等事务提交后再删）。不做并发冲突检测，后保存的覆盖先保存的（2026-11-27 拍板）。
     *
     * <p>请求里的行 id、文件 id 必须属于这张订单：别的订单的一律 404（§3 铁律 2/3）。
     */
    @Transactional
    public SavedOrderView save(UUID customerOrgId, UUID userId, UUID orderId, Draft draft) {
        CustomerOrder order = requireDraft(customerOrgId, orderId);
        order.updateDraft(blankToNull(draft.title()), draft.wantedDate());
        if (draft.shipTo() != null) {
            order.replaceShipTo(draft.shipTo());
        } else {
            order.clearShipTo();
        }
        Map<UUID, CustomerOrderPart> existing = new HashMap<>();
        lines.findByCustomerOrderIdAndCustomerOrgIdOrderByCreatedAtAsc(orderId, customerOrgId)
                .forEach(l -> existing.put(l.getId(), l));
        Set<UUID> kept = new HashSet<>();
        List<UUID> created = new ArrayList<>();
        Map<UUID, List<UUID>> filesToRemove = new HashMap<>();
        for (DraftLine input : draft.lines()) {
            if (input.id() == null) {
                if (!input.removeFileIds().isEmpty()) {
                    throw BusinessException.notFound("part.file_not_found");
                }
                created.add(insertLine(customerOrgId, userId, orderId, input).getId());
                continue;
            }
            CustomerOrderPart line = existing.get(input.id());
            if (line == null || !kept.add(input.id())) {
                throw BusinessException.notFound("order.line_not_found");
            }
            updateLine(customerOrgId, line, input);
            if (!input.removeFileIds().isEmpty()) {
                filesToRemove.put(line.getPartRevisionId(), input.removeFileIds());
            }
        }
        existing.values().stream().filter(l -> !kept.contains(l.getId())).forEach(lines::delete);
        orders.saveAndFlush(order);
        // ★ 删文件放在最后：改文件状态的 SQL 会清空持久化上下文（PartFileRepository 的 clearAutomatically），
        // 放在前面的话，之后对行 / 零件的改动落在已脱管的实体上，静默丢掉。上面的改动先 flush 进库。
        filesToRemove.forEach((revisionId, fileIds) ->
                fileIds.forEach(fileId -> drawings.removeFileOnCommit(customerOrgId, revisionId, fileId)));
        return new SavedOrderView(view(customerOrgId, order), created);
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
            return new OrderSummaryView(o.getId(), o.getTitle(), o.getStatus().name(), o.getWantedDate(),
                    c[0], c[1], o.getCreatedAt(), o.getSubmittedAt());
        });
    }

    @Transactional(readOnly = true)
    public OrderView get(UUID customerOrgId, UUID orderId) {
        return view(customerOrgId, requireOrder(customerOrgId, orderId));
    }

    /**
     * 单独改收货地址（订单自己的一份，C2）。2026-11-23 拍板订单就绪（READY）之前都能改 ——
     * 所以不走 {@link #requireDraft}，而是允许草稿到已确认；就绪和已取消的拒绝。
     * 2026-11-27 起地址内容由客户直接给（可以从地址簿挑一条复制过来，也可以直接改），不再按地址簿 id 取（推翻 11-26 Q5）。
     */
    @Transactional
    public OrderView updateShipTo(UUID customerOrgId, UUID orderId, ShipTo shipTo) {
        CustomerOrder order = orders.lockByIdAndCustomerOrgId(orderId, customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("order.not_found"));
        if (!SHIP_TO_EDITABLE.contains(order.getStatus())) {
            throw BusinessException.conflict("order.ship_to_locked");
        }
        order.replaceShipTo(shipTo);
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
        CustomerOrder order = requireDraft(customerOrgId, orderId);
        List<CustomerOrderPart> orderLines =
                lines.findByCustomerOrderIdAndCustomerOrgIdOrderByCreatedAtAsc(orderId, customerOrgId);
        if (orderLines.isEmpty()) {
            throw BusinessException.conflict("order.no_lines");
        }
        // 注册时可以不填公司名（docs/design/14 §4），但订单一旦提交就是对外文件，
        // 上面没有公司名 → 报价单、合同、发票都没主体。所以卡在这里，不往后拖。
        organizations.findById(customerOrgId)
                .filter(o -> o.getName() != null && !o.getName().isBlank())
                .orElseThrow(() -> new BusinessException(400, "organization.name_required"));
        // 报价的承诺交期以客户期望交期为起点（2026-11-15 拍板），所以提交前必须有日期
        if (order.getWantedDate() == null) {
            throw new BusinessException(400, "order.wanted_date_required");
        }
        // 收货地址提交时必填（2026-11-23 拍板）；保存地址时必填项已一起校验，这里只看填没填过
        if (order.getShipTo() == null) {
            throw new BusinessException(400, "order.ship_to_required");
        }
        // 草稿可以存没填齐的行（2026-11-27），提交时每行都要有图号、名称、数量
        Map<UUID, PartDesign> partById = parts.findByIdInAndCustomerOrgId(
                        orderLines.stream().map(CustomerOrderPart::getPartDesignId).collect(Collectors.toSet()),
                        customerOrgId).stream()
                .collect(Collectors.toMap(PartDesign::getId, Function.identity()));
        List<UUID> incomplete = orderLines.stream()
                .filter(l -> l.getQuantity() == null || isBlank(l.getPartName())
                        || isBlank(partById.get(l.getPartDesignId()).getCode()))
                .map(CustomerOrderPart::getId)
                .toList();
        if (!incomplete.isEmpty()) {
            throw new BusinessException(400, "order.line_incomplete", incomplete);
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

    /**
     * 删掉一张草稿（真删，不可恢复）。
     *
     * <p>草稿从未对外发出，留着只会在列表里堆垃圾 —— 所以是删，不是"取消"。
     * 清理顺序：文件审计 → 对象存储里的图纸 → 文件行 → 版本 → 零件行 → 订单。
     * 零件主数据（{@code part_design}）保留：它是这家客户自己的图号库，可能被别的订单复用。
     *
     * <p>对象存储删除是尽力而为：对象已经不在（或存储暂时不可用）不该让整个删除失败，
     * 记录一行 warn 即可 —— 数据库里那条记录才是"这张草稿存在过"的唯一依据。
     */
    @Transactional
    public void deleteDraft(UUID customerOrgId, UUID orderId) {
        CustomerOrder order = requireDraft(customerOrgId, orderId);
        List<CustomerOrderPart> rows =
                lines.findByCustomerOrderIdAndCustomerOrgIdOrderByCreatedAtAsc(orderId, customerOrgId);
        List<UUID> revisionIds = disposableRevisionIds(customerOrgId, orderId, rows);
        if (!revisionIds.isEmpty()) {
            List<PartFile> fileRows = files.findByPartRevisionIdIn(revisionIds);
            if (!fileRows.isEmpty()) {
                accessLogs.deleteByPartFileIdIn(fileRows.stream().map(PartFile::getId).toList());
                for (PartFile f : fileRows) {
                    try {
                        storage.delete(f.getStorageKey());
                    } catch (RuntimeException e) {
                        log.warn("failed to delete drawing object while deleting draft: fileId={} key={}",
                                f.getId(), f.getStorageKey(), e);
                    }
                }
                files.deleteAll(fileRows);
            }
            revisions.deleteAllById(revisionIds);
        }
        lines.deleteByCustomerOrderId(orderId);
        orders.delete(order);
    }

    /**
     * 删草稿时可以一起删掉的图纸版本：<b>未锁定、且没有别的订单在用</b>的那些。
     *
     * <p>★ 11-26 之前再次下单沿用的是上次<b>已锁定</b>的版本（D16），它属于已提交的订单。
     * 2026-11-18 之前这里不分青红皂白全删，「再下一单 → 删掉这张草稿」会把原订单的图纸、文件、审计一起删掉。
     */
    private List<UUID> disposableRevisionIds(UUID customerOrgId, UUID orderId, List<CustomerOrderPart> rows) {
        List<UUID> all = rows.stream()
                .map(CustomerOrderPart::getPartRevisionId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        if (all.isEmpty()) {
            return List.of();
        }
        java.util.Set<UUID> usedElsewhere = new java.util.HashSet<>(
                lines.findRevisionIdsUsedByOtherOrders(all, customerOrgId, orderId));
        return revisions.findByIdInAndCustomerOrgId(all, customerOrgId).stream()
                .filter(r -> !r.isLocked() && !usedElsewhere.contains(r.getId()))
                .map(PartRevision::getId)
                .toList();
    }

    // ---------- 零件行 ----------

    /**
     * 每加一行都建一个新零件 + 第 1 版，不按图号复用已有零件 —— 图号不再唯一（2026-11-26 拍板，取代 D16）。
     * 草稿行没有任何下游引用，删行就是物理删除（{@link #save} 里没带到的行）。
     */
    private CustomerOrderPart insertLine(UUID customerOrgId, UUID userId, UUID orderId, DraftLine input) {
        String name = blankToNull(input.name());
        PartDesign part = drawings.insertPart(customerOrgId, blankToNull(input.code()), name);
        PartRevision revision = drawings.insertNextRevision(customerOrgId, userId, part.getId(),
                blankToNull(input.customerRev()));
        // part_no 的编号规则至今没定：先填一个不重复的占位值，界面上不显示
        return lines.save(new CustomerOrderPart(orderId, customerOrgId, part.getId(), revision.getId(),
                UUID.randomUUID().toString(), name, input.quantity(), blankToNull(input.material()),
                blankToNull(input.surfaceTreatment())));
    }

    /**
     * 已有行按这次的内容整体替换：图号、名称改在零件上，数量 / 材料 / 表面处理改在行上，客户版本改在版本上。
     *
     * <p>★ 11-26 之前的草稿行可能挂着别的订单锁定过的版本（D16 沿用）。锁定的版本不许再动：换客户版本、删文件都拒绝。
     */
    private void updateLine(UUID customerOrgId, CustomerOrderPart line, DraftLine input) {
        PartDesign part = parts.findByIdAndCustomerOrgId(line.getPartDesignId(), customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("part.not_found"));
        PartRevision revision = revisions.findByIdAndCustomerOrgId(line.getPartRevisionId(), customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("part.revision_not_found"));
        String customerRev = blankToNull(input.customerRev());
        boolean revChanged = !java.util.Objects.equals(customerRev, revision.getCustomerRev());
        if ((revChanged || !input.removeFileIds().isEmpty()) && revision.isLocked()) {
            throw BusinessException.conflict("part.revision_locked");
        }
        if (revChanged) {
            revision.changeCustomerRev(customerRev);
        }
        String name = blankToNull(input.name());
        part.rename(blankToNull(input.code()), name);
        line.updateDraft(name, input.quantity(), blankToNull(input.material()), blankToNull(input.surfaceTreatment()));
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
        return new OrderView(order.getId(), order.getTitle(), order.getStatus().name(), order.getWantedDate(),
                order.getCreatedAt(), order.getSubmittedAt(), order.getShipTo(), views, order.getShipment(),
                completedDocuments(order));
    }

    /** 传完的随货文件。运营端看单也用这一份。 */
    List<OrderDocumentView> completedDocuments(CustomerOrder order) {
        return documents.findByCustomerOrderIdAndCustomerOrgIdAndUploadStatusOrderByCreatedAtAsc(order.getId(),
                        order.getCustomerOrgId(), CustomerOrderDocument.UploadStatus.COMPLETED).stream()
                .map(OrderDocumentView::of)
                .toList();
    }

    /** 运营端看单也用这一份（{@link OpsCustomerOrderService}），两端看到的行内容一致。 */
    List<OrderLineView> lineViews(UUID customerOrgId, List<CustomerOrderPart> orderLines) {
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

    private static OrderLineView toLineView(CustomerOrderPart line, PartDesign part, PartRevision revision,
                                            List<FileView> revisionFiles) {
        return new OrderLineView(line.getId(), line.getPartDesignId(), part.getCode(), line.getPartName(),
                line.getQuantity(), line.getMaterial(), line.getSurfaceTreatment(),
                line.getFulfillmentStatus().name(), RevisionView.of(revision, revisionFiles));
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

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
