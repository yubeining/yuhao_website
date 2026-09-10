package com.mfg.domain.order;

import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.PartyType;
import com.mfg.common.web.RequestContext;
import com.mfg.platform.storage.StorageService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 零件图纸：建零件 / 建版本 / 两段式上传 / 签发查看 URL + 审计。
 *
 * <p><b>每个方法都显式收 {@code customerOrgId}</b>，由 controller 从 principal 取出后传进来（§3 铁律 1），
 * 所有按 id 取数的查询都带这个条件（§3 铁律 2）。别人的零件 / 文件一律 404 ——
 * 不回 403，免得泄露「这个 id 是存在的」。
 *
 * <p>配置用 {@code @Value} 读而不是 {@code AppProperties}：ArchUnit 禁止 domain 依赖 {@code com.mfg.config}。
 */
@Service
class PartDrawingService {

    /** complete 时读文件开头多少字节来判类型 —— 各格式签名都在开头几十字节内，8KB 绰绰有余。 */
    private static final int HEAD_BYTES = 8192;

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
        if (parts.existsByCustomerOrgIdAndCode(customerOrgId, code)) {
            throw BusinessException.conflict("part.code_taken");
        }
        try {
            // saveAndFlush：唯一索引兜底的并发冲突要在这里就撞出来，否则拖到提交时变成 500
            PartDesign saved = parts.saveAndFlush(new PartDesign(customerOrgId, code, name));
            return PartView.of(saved, List.of());
        } catch (DataIntegrityViolationException e) {
            throw BusinessException.conflict("part.code_taken");
        }
    }

    @Transactional(readOnly = true)
    public PartView getPart(UUID customerOrgId, UUID partId) {
        PartDesign part = requirePart(customerOrgId, partId);
        List<PartRevision> revs = revisions.findByPartDesignIdAndCustomerOrgIdOrderByRevNoAsc(partId, customerOrgId);
        Map<UUID, List<FileView>> filesByRevision = revs.isEmpty()
                ? Map.of()
                : files.findByPartRevisionIdInAndCustomerOrgIdOrderByCreatedAtAsc(
                                revs.stream().map(PartRevision::getId).toList(), customerOrgId)
                        .stream()
                        .collect(Collectors.groupingBy(PartFile::getPartRevisionId,
                                Collectors.mapping(FileView::of, Collectors.toList())));
        return PartView.of(part, revs.stream()
                .map(r -> RevisionView.of(r, filesByRevision.getOrDefault(r.getId(), List.of())))
                .toList());
    }

    // ---------- 版本 ----------

    /** 版本号我方编，每个零件从 1 开始（2026-09-10 拍板）。 */
    @Transactional
    public RevisionView createRevision(UUID customerOrgId, UUID userId, UUID partId, String customerRev) {
        requirePart(customerOrgId, partId);
        int next = revisions.findTopByPartDesignIdAndCustomerOrgIdOrderByRevNoDesc(partId, customerOrgId)
                .map(r -> r.getRevNo() + 1)
                .orElse(1);
        try {
            PartRevision saved = revisions.saveAndFlush(
                    new PartRevision(partId, customerOrgId, next, customerRev, userId));
            return RevisionView.of(saved, List.of());
        } catch (DataIntegrityViolationException e) {
            // 两个请求同时算出同一个 next —— (part_design_id, rev_no) 唯一索引拦住了后到的那个
            throw BusinessException.conflict("part.revision_conflict");
        }
    }

    // ---------- 上传（两段式） ----------

    @Transactional
    public UploadTicket requestUpload(UUID customerOrgId, UUID userId, UUID partId, UUID revisionId,
                                      String filename, String contentType) {
        PartRevision revision = revisions.findByIdAndPartDesignIdAndCustomerOrgId(revisionId, partId, customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("part.revision_not_found"));
        if (!typeGuard.isAllowedExtension(filename)) {
            throw BusinessException.badRequest("part.file_type_not_allowed");
        }
        // 对象名服务端生成，不含客户文件名（设计文档 2 §5.1）
        String key = "drawing/" + UUID.randomUUID();
        PartFile file = files.save(new PartFile(revision.getId(), customerOrgId, key, filename, contentType, userId));
        return new UploadTicket(file.getId(),
                storage.presignedPut(key, signedUrlTtl, contentType).toString(),
                Instant.now().plus(signedUrlTtl));
    }

    /**
     * 字节已经进桶之后调。读文件头判真实类型：对得上 COMPLETED；对不上 REJECTED + 删对象 + 400。
     *
     * <p>★ {@code noRollbackFor}：REJECTED 这个状态必须落库，而拒绝是靠抛 {@link BusinessException} 回 400 的 ——
     * 默认规则下抛异常会把状态改动一起回滚，文件就永远卡在 PENDING。
     */
    @Transactional(noRollbackFor = BusinessException.class)
    public FileView complete(UUID customerOrgId, UUID fileId) {
        PartFile file = requireFile(customerOrgId, fileId);
        if (file.getUploadStatus() != PartFile.UploadStatus.PENDING) {
            throw BusinessException.conflict("part.file_not_pending");
        }
        long size = storage.head(file.getStorageKey())
                .orElseThrow(() -> BusinessException.conflict("part.file_object_missing"))
                .sizeBytes();

        DrawingTypeGuard.Verdict verdict = typeGuard.inspect(file.getOriginalFilename(), readHead(file.getStorageKey()));
        if (!verdict.accepted()) {
            file.markRejected(verdict.detectedType(), size);
            storage.delete(file.getStorageKey());
            throw BusinessException.badRequest("part.file_type_not_allowed");
        }
        file.markCompleted(verdict.detectedType(), size, Instant.now());
        return FileView.of(file);
    }

    // ---------- 查看 + 审计（红线 1） ----------

    /**
     * 顺序是「校验 → 签名 → 写审计 → 返回」。审计写不进去就抛异常，URL 不会离开服务端 ——
     * 没有审计行就没有 URL。校验不过（别人的文件 / 还没传完）直接抛，<b>不落审计</b>。
     */
    @Transactional
    public ViewUrl issueViewUrl(UUID customerOrgId, UUID accessorUserId, PartyType accessorPartyType, UUID fileId) {
        PartFile file = requireFile(customerOrgId, fileId);
        if (file.getUploadStatus() != PartFile.UploadStatus.COMPLETED) {
            throw BusinessException.conflict("part.file_not_completed");
        }
        Instant now = Instant.now();
        String url = storage.presignedGet(file.getStorageKey(), signedUrlTtl).toString();
        accessLog.save(new PartFileAccessLog(file.getId(), file.getPartRevisionId(), customerOrgId,
                accessorUserId, accessorPartyType, customerOrgId,
                PartFileAccessLog.AccessType.SIGNED_URL_ISSUED, RequestContext.traceId(), now));
        return new ViewUrl(url, now.plus(signedUrlTtl));
    }

    // ---------- helpers ----------

    private PartDesign requirePart(UUID customerOrgId, UUID partId) {
        return parts.findByIdAndCustomerOrgId(partId, customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("part.not_found"));
    }

    private PartFile requireFile(UUID customerOrgId, UUID fileId) {
        return files.findByIdAndCustomerOrgId(fileId, customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("part.file_not_found"));
    }

    private byte[] readHead(String key) {
        try (InputStream in = storage.get(key)) {
            return in.readNBytes(HEAD_BYTES);
        } catch (IOException e) {
            throw new UncheckedIOException("failed to read head of " + key, e);
        }
    }
}
