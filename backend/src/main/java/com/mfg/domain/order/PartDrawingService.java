package com.mfg.domain.order;

import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.PartyType;
import com.mfg.common.web.RequestContext;
import com.mfg.platform.storage.StorageService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 零件图纸：建零件 / 建版本 / 两段式上传 / 删文件 / 签发查看 URL + 审计。
 *
 * <p><b>每个方法都显式收 {@code customerOrgId}</b>，由 controller 从 principal 取出后传进来（§3 铁律 1），
 * 所有按 id 取数的查询都带这个条件（§3 铁律 2）。别人的零件 / 文件一律 404 ——
 * 不回 403，免得泄露「这个 id 是存在的」。
 *
 * <p><b>版本锁定</b>（2026-09-14）：订单提交时锁定各行引用的版本，此后这一版不许加 / 删文件。
 * 三个改文件的入口（申请上传、complete、删文件）都要拦，而且 complete 和删文件的状态更新
 * 在同一条 SQL 里带上「版本未锁定」的条件 —— 否则「锁定前申请、锁定后 complete」能钻过去。
 *
 * <p>配置用 {@code @Value} 读而不是 {@code AppProperties}：ArchUnit 禁止 domain 依赖 {@code com.mfg.config}。
 */
@Service
class PartDrawingService {

    /** complete 时读文件开头多少字节来判类型 —— 各格式签名都在开头几十字节内，8KB 绰绰有余。 */
    private static final int HEAD_BYTES = 8192;
    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";

    private final PartDesignRepository parts;
    private final PartRevisionRepository revisions;
    private final PartFileRepository files;
    private final PartFileAccessLogRepository accessLog;
    private final StorageService storage;
    private final Duration signedUrlTtl;
    private final DrawingTypeGuard typeGuard;

    PartDrawingService(PartDesignRepository parts, PartRevisionRepository revisions, PartFileRepository files,
                       PartFileAccessLogRepository accessLog, StorageService storage,
                       @Value("${app.storage.signed-url-ttl-seconds}") long signedUrlTtlSeconds,
                       @Value("${app.storage.allowed-drawing-types}") String allowedDrawingTypes) {
        this.parts = parts;
        this.revisions = revisions;
        this.files = files;
        this.accessLog = accessLog;
        this.storage = storage;
        this.signedUrlTtl = Duration.ofSeconds(signedUrlTtlSeconds);
        this.typeGuard = new DrawingTypeGuard(Set.copyOf(Arrays.asList(allowedDrawingTypes.split(","))));
    }

    // ---------- 零件 ----------

    /** 同一客户同一图号 = 同一个零件（D16），第二次建 409。 */
    @Transactional
    public PartView createPart(UUID customerOrgId, String code, String name) {
        return PartView.of(insertPart(customerOrgId, code, name), List.of());
    }

    /** 按图号查本客户已有的零件（D16：前端在订单里加零件时「按图号命中已有零件」）。 */
    @Transactional(readOnly = true)
    public PartView findPartByCode(UUID customerOrgId, String code) {
        PartDesign part = parts.findByCustomerOrgIdAndCode(customerOrgId, code)
                .orElseThrow(() -> BusinessException.notFound("part.not_found"));
        return viewOf(customerOrgId, part);
    }

    @Transactional(readOnly = true)
    public PartView getPart(UUID customerOrgId, UUID partId) {
        return viewOf(customerOrgId, requirePart(customerOrgId, partId));
    }

    // ---------- 版本 ----------

    /** 版本号我方编，每个零件从 1 开始（2026-09-10 拍板）。 */
    @Transactional
    public RevisionView createRevision(UUID customerOrgId, UUID userId, UUID partId, String customerRev) {
        requirePart(customerOrgId, partId);
        return RevisionView.of(insertNextRevision(customerOrgId, userId, partId, customerRev), List.of());
    }

    // ---------- 上传（两段式） ----------

    @Transactional
    public UploadTicket requestUpload(UUID customerOrgId, UUID userId, UUID partId, UUID revisionId,
                                      String filename, String contentType) {
        PartRevision revision = revisions.findByIdAndPartDesignIdAndCustomerOrgId(revisionId, partId, customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("part.revision_not_found"));
        if (revision.isLocked()) {
            throw BusinessException.conflict("part.revision_locked");
        }
        if (!typeGuard.isAllowedExtension(filename)) {
            throw BusinessException.badRequest("part.file_type_not_allowed");
        }
        // Content-Type 会被签进上传 URL，浏览器 PUT 时必须一字不差。浏览器对 .step 这类文件常给空串，
        // 所以服务端归一化，并在回执里明确告诉前端要带哪个。
        String signedType = contentType == null || contentType.isBlank() ? DEFAULT_CONTENT_TYPE : contentType.trim();
        // 对象名服务端生成，不含客户文件名（设计文档 2 §5.1）
        String key = "drawing/" + UUID.randomUUID();
        PartFile file = files.save(new PartFile(revision.getId(), customerOrgId, key, filename, signedType, userId));
        return new UploadTicket(file.getId(),
                storage.presignedPut(key, signedUrlTtl, signedType).toString(),
                signedType,
                Instant.now().plus(signedUrlTtl));
    }

    /**
     * 字节已经进桶之后调。读文件头判真实类型：对得上 COMPLETED；对不上 REJECTED + 删对象 + 400。
     *
     * <p>★ <b>故意不加 {@code @Transactional}</b>：中间要 head 对象、读文件头，这些是网络 IO，
     * 不能占着数据库连接等。状态更新是一条带条件的 SQL（只改仍是 PENDING、且版本未锁定的行），
     * 并发 / 重试时只有一个请求真正改到行，其余的重新读一遍状态再决定返回什么 —— 不会 500。
     *
     * <p>幂等：已经 COMPLETED 的直接返回（前端直传后网络超时重试，不该看到失败）。
     */
    public FileView complete(UUID customerOrgId, UUID fileId) {
        PartFile file = requireFile(customerOrgId, fileId);
        if (file.getUploadStatus() == PartFile.UploadStatus.COMPLETED) {
            return FileView.of(file);
        }
        if (file.getUploadStatus() != PartFile.UploadStatus.PENDING) {
            throw BusinessException.conflict("part.file_not_pending");
        }
        requireUnlocked(customerOrgId, file.getPartRevisionId());

        long size = storage.head(file.getStorageKey())
                .orElseThrow(() -> BusinessException.conflict("part.file_object_missing"))
                .sizeBytes();
        DrawingTypeGuard.Verdict verdict = typeGuard.inspect(file.getOriginalFilename(),
                storage.readRange(file.getStorageKey(), 0, HEAD_BYTES));

        if (!verdict.accepted()) {
            // 先把 REJECTED 落库、再删对象：反过来的话，删完对象而状态没写进去，这一行会永远卡在 PENDING
            int changed = files.transitionIfRevisionUnlocked(fileId, customerOrgId,
                    List.of(PartFile.UploadStatus.PENDING), PartFile.UploadStatus.REJECTED,
                    verdict.detectedType(), size, null, Instant.now());
            if (changed == 1) {
                storage.delete(file.getStorageKey());
                throw BusinessException.badRequest("part.file_type_not_allowed");
            }
            return settledOutcome(customerOrgId, fileId);
        }
        Instant now = Instant.now();
        int changed = files.transitionIfRevisionUnlocked(fileId, customerOrgId,
                List.of(PartFile.UploadStatus.PENDING), PartFile.UploadStatus.COMPLETED,
                verdict.detectedType(), size, now, now);
        return changed == 1 ? FileView.of(requireFile(customerOrgId, fileId)) : settledOutcome(customerOrgId, fileId);
    }

    /**
     * 草稿里删图纸：行改成 REMOVED 保留（它可能已经有审计记录指向它），桶里的对象删掉。
     * 版本已锁定时拒绝 —— 同样是带条件的 SQL，锁定和删除并发时不会删掉已锁版本里的文件。
     */
    public FileView removeFile(UUID customerOrgId, UUID fileId) {
        PartFile file = requireFile(customerOrgId, fileId);
        if (file.getUploadStatus() == PartFile.UploadStatus.REMOVED) {
            return FileView.of(file);
        }
        requireUnlocked(customerOrgId, file.getPartRevisionId());
        int changed = files.transitionIfRevisionUnlocked(fileId, customerOrgId,
                List.of(PartFile.UploadStatus.PENDING, PartFile.UploadStatus.COMPLETED, PartFile.UploadStatus.REJECTED),
                PartFile.UploadStatus.REMOVED, file.getDetectedType(), file.getSizeBytes(), file.getCompletedAt(),
                Instant.now());
        if (changed != 1) {
            requireUnlocked(customerOrgId, file.getPartRevisionId());
            throw BusinessException.conflict("part.file_not_pending");
        }
        storage.delete(file.getStorageKey());
        return FileView.of(requireFile(customerOrgId, fileId));
    }

    // ---------- 查看 + 审计（红线 1） ----------

    /** 不带业务上下文看图（第 1 步的接口，界面已不再用）。 */
    @Transactional
    public ViewUrl issueViewUrl(UUID customerOrgId, UUID accessorUserId, PartyType accessorPartyType,
                                UUID accessorOrgId, UUID fileId) {
        return issueViewUrl(customerOrgId, accessorUserId, accessorPartyType, accessorOrgId, fileId, null, null);
    }

    /**
     * 顺序是「校验 → 签名 → 写审计 → 返回」。审计写不进去就抛异常，URL 不会离开服务端 ——
     * 没有审计行就没有 URL。校验不过（别人的文件 / 还没传完）直接抛，<b>不落审计</b>。
     *
     * <p>{@code accessorOrgId} 单独传：第 3 步运营看图时，访问方不是图纸的归属客户，运营也没有组织。
     * 业务上下文（在哪张订单里看的）由调用方先校验过归属再传进来。
     */
    @Transactional
    ViewUrl issueViewUrl(UUID customerOrgId, UUID accessorUserId, PartyType accessorPartyType, UUID accessorOrgId,
                         UUID fileId, PartFileAccessLog.ContextType contextType, UUID contextId) {
        PartFile file = requireFile(customerOrgId, fileId);
        if (file.getUploadStatus() != PartFile.UploadStatus.COMPLETED) {
            throw BusinessException.conflict("part.file_not_completed");
        }
        Instant now = Instant.now();
        String url = storage.presignedGet(file.getStorageKey(), signedUrlTtl, file.getOriginalFilename()).toString();
        accessLog.save(new PartFileAccessLog(file.getId(), file.getPartRevisionId(), customerOrgId,
                accessorUserId, accessorPartyType, accessorOrgId,
                PartFileAccessLog.AccessType.SIGNED_URL_ISSUED, contextType, contextId, RequestContext.traceId(), now));
        return new ViewUrl(url, now.plus(signedUrlTtl));
    }

    // ---------- 给订单域同包复用 ----------

    PartDesign insertPart(UUID customerOrgId, String code, String name) {
        if (parts.existsByCustomerOrgIdAndCode(customerOrgId, code)) {
            throw BusinessException.conflict("part.code_taken");
        }
        try {
            // saveAndFlush：唯一索引兜底的并发冲突要在这里就撞出来，否则拖到提交时变成 500
            return parts.saveAndFlush(new PartDesign(customerOrgId, code, name));
        } catch (DataIntegrityViolationException e) {
            throw BusinessException.conflict("part.code_taken");
        }
    }

    PartRevision insertNextRevision(UUID customerOrgId, UUID userId, UUID partId, String customerRev) {
        int next = revisions.findTopByPartDesignIdAndCustomerOrgIdOrderByRevNoDesc(partId, customerOrgId)
                .map(r -> r.getRevNo() + 1)
                .orElse(1);
        try {
            return revisions.saveAndFlush(new PartRevision(partId, customerOrgId, next, customerRev, userId));
        } catch (DataIntegrityViolationException e) {
            // 两个请求同时算出同一个 next —— (part_design_id, rev_no) 唯一索引拦住了后到的那个
            throw BusinessException.conflict("part.revision_conflict");
        }
    }

    /** 各版本下传完的文件，按版本分组。 */
    Map<UUID, List<FileView>> completedFilesByRevision(UUID customerOrgId, Collection<UUID> revisionIds) {
        if (revisionIds.isEmpty()) {
            return Map.of();
        }
        return files.findByPartRevisionIdInAndCustomerOrgIdAndUploadStatusOrderByCreatedAtAsc(
                        revisionIds, customerOrgId, PartFile.UploadStatus.COMPLETED)
                .stream()
                .collect(Collectors.groupingBy(PartFile::getPartRevisionId,
                        Collectors.mapping(FileView::of, Collectors.toList())));
    }

    // ---------- helpers ----------

    private PartView viewOf(UUID customerOrgId, PartDesign part) {
        List<PartRevision> revs = revisions.findByPartDesignIdAndCustomerOrgIdOrderByRevNoAsc(part.getId(), customerOrgId);
        Map<UUID, List<FileView>> byRevision =
                completedFilesByRevision(customerOrgId, revs.stream().map(PartRevision::getId).toList());
        return PartView.of(part, revs.stream()
                .map(r -> RevisionView.of(r, byRevision.getOrDefault(r.getId(), List.of())))
                .toList());
    }

    /** 条件更新没改到行：别的请求先一步改了。按现在的真实状态给结论。 */
    private FileView settledOutcome(UUID customerOrgId, UUID fileId) {
        PartFile now = requireFile(customerOrgId, fileId);
        if (now.getUploadStatus() == PartFile.UploadStatus.COMPLETED) {
            return FileView.of(now);
        }
        requireUnlocked(customerOrgId, now.getPartRevisionId());
        if (now.getUploadStatus() == PartFile.UploadStatus.REJECTED) {
            throw BusinessException.badRequest("part.file_type_not_allowed");
        }
        throw BusinessException.conflict("part.file_not_pending");
    }

    private void requireUnlocked(UUID customerOrgId, UUID revisionId) {
        PartRevision revision = revisions.findByIdAndCustomerOrgId(revisionId, customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("part.revision_not_found"));
        if (revision.isLocked()) {
            throw BusinessException.conflict("part.revision_locked");
        }
    }

    private PartDesign requirePart(UUID customerOrgId, UUID partId) {
        return parts.findByIdAndCustomerOrgId(partId, customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("part.not_found"));
    }

    private PartFile requireFile(UUID customerOrgId, UUID fileId) {
        return files.findByIdAndCustomerOrgId(fileId, customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("part.file_not_found"));
    }
}
