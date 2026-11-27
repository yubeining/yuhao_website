package com.mfg.domain.order;

import com.mfg.common.cache.CacheKeys;
import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.PartyType;
import com.mfg.common.service.RedisService;
import com.mfg.common.web.RequestContext;
import com.mfg.platform.storage.StorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
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
 * 三个改文件的入口（申请上传、complete、删文件）都要拦：complete 建记录前在同一个事务里锁住版本行再判，
 * 删文件的状态更新在同一条 SQL 里带上「版本未锁定」的条件 —— 否则「锁定前申请、锁定后 complete」能钻过去。
 *
 * <p><b>上传凭证</b>（2026-11-27）：申请上传不建文件记录，凭证存 Redis；complete 校验通过才建记录。
 * 上传失败（断网、关页面、类型不对）库里什么都不留。
 *
 * <p>配置用 {@code @Value} 读而不是 {@code AppProperties}：ArchUnit 禁止 domain 依赖 {@code com.mfg.config}。
 */
@Service
class PartDrawingService {

    private static final Logger log = LoggerFactory.getLogger(PartDrawingService.class);

    /** complete 时读文件开头多少字节来判类型 —— 各格式签名都在开头几十字节内，8KB 绰绰有余。 */
    private static final int HEAD_BYTES = 8192;
    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";
    /** 同一张凭证 complete 的互斥锁：够覆盖一次挪对象 + 读文件头，进程挂了也会自己过期。 */
    private static final int COMPLETE_LOCK_SECONDS = 120;

    private final PartDesignRepository parts;
    private final PartRevisionRepository revisions;
    private final PartFileRepository files;
    private final PartFileAccessLogRepository accessLog;
    private final StorageService storage;
    private final Duration signedUrlTtl;
    private final DrawingTypeGuard typeGuard;
    /** complete / 删文件不能整体包在事务里（中间有存储网络 IO），只把「锁版本 + 改状态」这一小段放进事务。 */
    private final TransactionTemplate tx;
    private final RedisService redis;

    PartDrawingService(PartDesignRepository parts, PartRevisionRepository revisions, PartFileRepository files,
                       PartFileAccessLogRepository accessLog, StorageService storage, RedisService redis,
                       PlatformTransactionManager transactionManager,
                       @Value("${app.storage.signed-url-ttl-seconds}") long signedUrlTtlSeconds,
                       @Value("${app.storage.allowed-drawing-types}") String allowedDrawingTypes) {
        this.tx = new TransactionTemplate(transactionManager);
        this.parts = parts;
        this.revisions = revisions;
        this.files = files;
        this.accessLog = accessLog;
        this.storage = storage;
        this.redis = redis;
        this.signedUrlTtl = Duration.ofSeconds(signedUrlTtlSeconds);
        this.typeGuard = new DrawingTypeGuard(Set.copyOf(Arrays.asList(allowedDrawingTypes.split(","))));
    }

    // ---------- 零件 ----------

    @Transactional
    public PartView createPart(UUID customerOrgId, String code, String name) {
        return PartView.of(insertPart(customerOrgId, code, name), List.of());
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

    /**
     * 申请上传：只校验、发凭证，<b>不建文件记录</b>（2026-11-27）—— 传失败（断网、关页面）什么都不留。
     * 凭证存 Redis，和签名 PUT 链接同样的有效期，到期自动消失。
     */
    @Transactional(readOnly = true)
    public DrawingUploadTicket requestUpload(UUID customerOrgId, UUID userId, UUID partId, UUID revisionId,
                                             String filename, String contentType) {
        PartRevision revision = revisions.findByIdAndCustomerOrgId(revisionId, customerOrgId)
                .filter(r -> r.getPartDesignId().equals(partId))
                .orElseThrow(() -> BusinessException.notFound("part.revision_not_found"));
        if (revision.isLocked()) {
            throw BusinessException.conflict("part.revision_locked");
        }
        if (!typeGuard.isAllowedExtension(filename)) {
            throw BusinessException.badRequest("part.file_type_not_allowed");
        }
        // Content-Type 会被签进上传 URL，浏览器 PUT 时必须一字不差。浏览器对 .step 这类文件常给空串，
        // 所以服务端归一化，并在回执里明确告诉前端要带哪个。
        String signedType = contentType == null || contentType.isBlank()
                ? previewContentType(filename)
                : contentType.trim();
        // 对象名服务端生成，不含客户文件名（设计文档 2 §5.1）
        String key = "drawing/" + UUID.randomUUID();
        UUID uploadId = UUID.randomUUID();
        redis.set(CacheKeys.drawingUpload(customerOrgId, uploadId),
                new PendingDrawingUpload(partId, revision.getId(), userId, key, filename, signedType),
                ticketTtlSeconds());
        // ★ 埋点：上传是从浏览器直传对象存储的，服务端只看到"开始"和"完成"两个点。
        //   这两个点之间的间隔就是真实的传输耗时，排障时不用再让用户开 DevTools。
        log.info("part.file.presign uploadId={} ttlSeconds={}", uploadId, signedUrlTtl.getSeconds());
        return new DrawingUploadTicket(uploadId,
                storage.presignedPut(key, signedUrlTtl, signedType).toString(),
                signedType,
                Instant.now().plus(signedUrlTtl));
    }

    /**
     * 字节已经进桶之后调。凭证对得上、读文件头判真实类型也对得上，<b>这时才建文件记录</b>（直接是 COMPLETED）；
     * 类型对不上：删对象 + 400，不建记录。凭证不存在（过期 / 别人的 / 编的）一律 404。
     *
     * <p>★ <b>故意不加 {@code @Transactional}</b>：中间要 head 对象、读文件头，这些是网络 IO，
     * 不能占着数据库连接等。只有「锁版本 + 建行」那一小段在事务里（和订单提交锁版本互斥）。
     *
     * <p>幂等：同一张凭证 complete 过，再调返回同一份文件（前端直传后网络超时重试，不该看到失败）。
     * 并发的 complete 靠凭证上的 Redis 锁排开，抢不到锁的回 409，不会 500，也不会建出两条记录。
     */
    public FileView complete(UUID customerOrgId, UUID uploadId) {
        FileView done = alreadyCompleted(customerOrgId, uploadId);
        if (done != null) {
            return done;
        }
        String lockKey = CacheKeys.drawingUploadLock(customerOrgId, uploadId);
        String fence = UUID.randomUUID().toString();
        if (!redis.tryLock(lockKey, fence, COMPLETE_LOCK_SECONDS)) {
            throw BusinessException.conflict("part.upload_in_progress");
        }
        try {
            // 拿到锁之后再看一次：等锁的这段时间里另一个请求可能已经建好了
            done = alreadyCompleted(customerOrgId, uploadId);
            if (done != null) {
                return done;
            }
            PendingDrawingUpload upload = redis.get(CacheKeys.drawingUpload(customerOrgId, uploadId),
                    PendingDrawingUpload.class);
            if (upload == null) {
                throw BusinessException.notFound("part.upload_not_found");
            }
            return completeLocked(customerOrgId, uploadId, upload);
        } finally {
            redis.releaseLock(lockKey, fence);
        }
    }

    private FileView completeLocked(UUID customerOrgId, UUID uploadId, PendingDrawingUpload upload) {
        requireUnlocked(customerOrgId, upload.revisionId());
        String uploadKey = upload.uploadKey();
        if (storage.head(uploadKey).isEmpty()) {
            // 凭证留着：字节真传上去之后可以再 complete
            throw BusinessException.conflict("part.file_object_missing");
        }
        // ★ 先把对象挪到客户不知道的新地址，后面的类型校验、大小、记录都以这份为准。
        //   签名 PUT 链接在有效期内可以反复用：不挪走的话，客户 complete、提交锁定之后还能往原地址再传一份，
        //   运营报价、供应商加工用的「已锁定图纸」就被悄悄换掉了，类型校验也跟着被绕过（2026-11-18 review）。
        String pinnedKey = "drawing/" + UUID.randomUUID();
        storage.copy(uploadKey, pinnedKey);
        long size = storage.head(pinnedKey)
                .orElseThrow(() -> BusinessException.conflict("part.file_object_missing"))
                .sizeBytes();
        DrawingTypeGuard.Verdict verdict = typeGuard.inspect(upload.filename(),
                storage.readRange(pinnedKey, 0, HEAD_BYTES));
        if (!verdict.accepted()) {
            redis.delete(CacheKeys.drawingUpload(customerOrgId, uploadId));
            storage.delete(pinnedKey);
            deleteQuietly(uploadKey);
            throw BusinessException.badRequest("part.file_type_not_allowed");
        }
        PartFile file;
        try {
            file = insertCompleted(customerOrgId, upload, pinnedKey, verdict.detectedType(), size);
        } catch (RuntimeException e) {
            // 版本已锁定 / 不存在：这份副本没人会引用了
            storage.delete(pinnedKey);
            throw e;
        }
        redis.set(CacheKeys.drawingUploadDone(customerOrgId, uploadId), file.getId().toString(), ticketTtlSeconds());
        redis.delete(CacheKeys.drawingUpload(customerOrgId, uploadId));
        // 记录已经指向新地址，上传地址上的那份不再需要；删不掉只留一个没人引用的对象，不影响正确性
        deleteQuietly(uploadKey);
        log.info("part.file.upload_completed fileId={} uploadId={} sizeBytes={}", file.getId(), uploadId, size);
        return FileView.of(file);
    }

    /** 这张凭证 complete 过就返回那份文件，没有返回 null。 */
    private FileView alreadyCompleted(UUID customerOrgId, UUID uploadId) {
        String fileId = redis.get(CacheKeys.drawingUploadDone(customerOrgId, uploadId), String.class);
        return fileId == null ? null : FileView.of(requireFile(customerOrgId, UUID.fromString(fileId)));
    }

    /** 短事务：锁住版本行（和订单提交互斥）→ 已锁定就 409 → 建一条 COMPLETED 记录。 */
    private PartFile insertCompleted(UUID customerOrgId, PendingDrawingUpload upload, String storageKey,
                                     String detectedType, long sizeBytes) {
        return tx.execute(status -> {
            PartRevision revision = revisions.lockByIdAndCustomerOrgId(upload.revisionId(), customerOrgId)
                    .orElseThrow(() -> BusinessException.notFound("part.revision_not_found"));
            if (revision.isLocked()) {
                throw BusinessException.conflict("part.revision_locked");
            }
            PartFile file = new PartFile(revision.getId(), customerOrgId, storageKey, upload.filename(),
                    upload.contentType(), upload.userId());
            file.markCompleted(detectedType, sizeBytes, Instant.now());
            return files.saveAndFlush(file);
        });
    }

    private int ticketTtlSeconds() {
        return Math.toIntExact(signedUrlTtl.getSeconds());
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
        int changed = transitionLockingRevision(customerOrgId, file.getPartRevisionId(), fileId,
                List.of(PartFile.UploadStatus.PENDING, PartFile.UploadStatus.COMPLETED, PartFile.UploadStatus.REJECTED),
                PartFile.UploadStatus.REMOVED, file.getDetectedType(), file.getSizeBytes(), file.getCompletedAt());
        if (changed != 1) {
            throw BusinessException.conflict("part.file_not_pending");
        }
        // 状态已经提交之后才删对象：反过来的话，删完对象而状态没写进去，文件就坏了
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

    /**
     * 预览用 URL：同样是签名 GET，但<b>不带 attachment</b> —— 浏览器才会内嵌显示 PDF / 图片。
     *
     * <p>下载和预览是两个 URL：下载必须带 {@code Content-Disposition: attachment}，
     * 否则用户点「下载」会被 PDF 查看器接管；预览反过来，带了 attachment 就变成下载。
     *
     * <p>审计与下载一致：每次签发都落一行，预览不等于免费访问。
     */
    @Transactional
    ViewUrl issuePreviewUrl(UUID customerOrgId, UUID accessorUserId, PartyType accessorPartyType,
                            UUID accessorOrgId, UUID fileId, PartFileAccessLog.ContextType contextType,
                            UUID contextId) {
        PartFile file = requireFile(customerOrgId, fileId);
        if (file.getUploadStatus() != PartFile.UploadStatus.COMPLETED) {
            throw BusinessException.conflict("part.file_not_completed");
        }
        Instant now = Instant.now();
        String url = storage.presignedPreview(file.getStorageKey(), signedUrlTtl,
                previewContentType(file.getOriginalFilename())).toString();
        accessLog.save(new PartFileAccessLog(file.getId(), file.getPartRevisionId(), customerOrgId,
                accessorUserId, accessorPartyType, accessorOrgId,
                PartFileAccessLog.AccessType.SIGNED_URL_ISSUED, contextType, contextId, RequestContext.traceId(), now));
        return new ViewUrl(url, now.plus(signedUrlTtl));
    }

    /**
     * 能内嵌渲染的扩展名 → Content-Type；其余一律 {@code application/octet-stream}（只下载）。
     *
     * <p>客户端声明的 {@code file.type} 不可靠：从网盘/微信下载来的 PDF 常常是空串，
     * 存成 octet-stream 之后浏览器只会下载，不会渲染。
     */
    private static String previewContentType(String filename) {
        String name = filename == null ? "" : filename.toLowerCase(java.util.Locale.ROOT);
        if (name.endsWith(".pdf")) return "application/pdf";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".webp")) return "image/webp";
        if (name.endsWith(".gif")) return "image/gif";
        if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (name.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (name.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        if (name.endsWith(".doc")) return "application/msword";
        if (name.endsWith(".xls")) return "application/vnd.ms-excel";
        if (name.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
        return DEFAULT_CONTENT_TYPE;
    }

    // ---------- 给订单域同包复用 ----------

    /** 图号不再唯一（2026-11-26 拍板，取代 D16）：同一图号每次都是新零件。 */
    PartDesign insertPart(UUID customerOrgId, String code, String name) {
        return parts.save(new PartDesign(customerOrgId, code, name));
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

    /**
     * 整张保存订单时删一份图纸（2026-11-27）：在调用方的事务里把文件改成 REMOVED，对象等事务提交后再删 ——
     * 保存失败回滚时文件还在。文件必须属于这个版本，否则和不存在一样 404；版本已锁定时拒绝（同 {@link #removeFile}）。
     */
    void removeFileOnCommit(UUID customerOrgId, UUID revisionId, UUID fileId) {
        PartFile file = files.findByIdAndCustomerOrgId(fileId, customerOrgId)
                .filter(f -> f.getPartRevisionId().equals(revisionId))
                .orElseThrow(() -> BusinessException.notFound("part.file_not_found"));
        if (file.getUploadStatus() == PartFile.UploadStatus.REMOVED) {
            return;
        }
        int changed = transitionLockingRevision(customerOrgId, revisionId, fileId,
                List.of(PartFile.UploadStatus.PENDING, PartFile.UploadStatus.COMPLETED, PartFile.UploadStatus.REJECTED),
                PartFile.UploadStatus.REMOVED, file.getDetectedType(), file.getSizeBytes(), file.getCompletedAt());
        if (changed != 1) {
            throw BusinessException.conflict("part.file_not_pending");
        }
        String key = file.getStorageKey();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                deleteQuietly(key);
            }
        });
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

    private void deleteQuietly(String key) {
        try {
            storage.delete(key);
        } catch (RuntimeException e) {
            log.warn("failed to delete upload object after pinning: key={} reason={}", key, e.toString());
        }
    }

    private int transitionLockingRevision(UUID customerOrgId, UUID revisionId, UUID fileId,
                                          List<PartFile.UploadStatus> from, PartFile.UploadStatus to,
                                          String detectedType, Long sizeBytes, Instant completedAt) {
        Integer changed = tx.execute(status -> {
            PartRevision revision = revisions.lockByIdAndCustomerOrgId(revisionId, customerOrgId)
                    .orElseThrow(() -> BusinessException.notFound("part.revision_not_found"));
            if (revision.isLocked()) {
                throw BusinessException.conflict("part.revision_locked");
            }
            return files.transitionIfRevisionUnlocked(fileId, customerOrgId, from, to, detectedType, sizeBytes,
                    completedAt, Instant.now());
        });
        return changed == null ? 0 : changed;
    }

    private PartView viewOf(UUID customerOrgId, PartDesign part) {
        List<PartRevision> revs = revisions.findByPartDesignIdAndCustomerOrgIdOrderByRevNoAsc(part.getId(), customerOrgId);
        Map<UUID, List<FileView>> byRevision =
                completedFilesByRevision(customerOrgId, revs.stream().map(PartRevision::getId).toList());
        return PartView.of(part, revs.stream()
                .map(r -> RevisionView.of(r, byRevision.getOrDefault(r.getId(), List.of())))
                .toList());
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

    /**
     * 读出一份图纸的内容，交给 AI 成本估算发给外部模型。顺序同签名 URL：「校验 → 写审计 → 读内容」，
     * 审计写不进去就不读（CLAUDE.md §3 铁律 6）。调用方已校验文件属于这张单的这一行。
     *
     * <p>★ 不开事务：审计那一行由仓库自己的短事务写完提交，之后读对象存储时不占数据库连接 ——
     * 一份图纸几十 MB，存储慢的时候几次并发估算就能把连接池占住。
     */
    byte[] readForAi(UUID customerOrgId, UUID accessorUserId, UUID accessorOrgId, PartFile file, UUID orderId) {
        if (!file.getCustomerOrgId().equals(customerOrgId)
                || file.getUploadStatus() != PartFile.UploadStatus.COMPLETED) {
            throw BusinessException.notFound("part.file_not_found");
        }
        accessLog.save(new PartFileAccessLog(file.getId(), file.getPartRevisionId(), customerOrgId,
                accessorUserId, PartyType.OPERATOR, accessorOrgId, PartFileAccessLog.AccessType.READ_FOR_AI,
                PartFileAccessLog.ContextType.CUSTOMER_ORDER, orderId, RequestContext.traceId(), Instant.now()));
        try (InputStream in = storage.get(file.getStorageKey())) {
            return in.readAllBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private PartFile requireFile(UUID customerOrgId, UUID fileId) {
        return files.findByIdAndCustomerOrgId(fileId, customerOrgId)
                .orElseThrow(() -> BusinessException.notFound("part.file_not_found"));
    }
}
