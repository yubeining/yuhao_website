package com.mfg.domain.order;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/**
 * 某个图纸版本下的一个文件。字节在对象存储里,这里只存元数据和上传状态。
 *
 * <h3>上传是两段式</h3>
 * <ol>
 *   <li>申请:建一行 {@code PENDING},给浏览器一个预签名 PUT —— 字节直传桶,不经过应用。</li>
 *   <li>complete:服务端去存储读文件头判真实类型。对得上 → {@code COMPLETED};
 *       对不上 → {@code REJECTED},并删掉桶里的对象。</li>
 * </ol>
 * 只有 {@code COMPLETED} 的文件才能签发查看 URL。
 *
 * <p>{@code storageKey} 由服务端生成,不含客户文件名(设计文档 2 §5.1);
 * {@code declaredContentType} 是客户端声称的类型,不可信,只做记录。
 */
@Entity
@Table(name = "part_file")
class PartFile extends BaseEntity {

    enum UploadStatus {
        PENDING, COMPLETED, REJECTED,
        /** 客户在草稿里删掉的。行保留 —— 它可能已经有审计记录指向它。 */
        REMOVED
    }

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "part_revision_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID partRevisionId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_org_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID customerOrgId;

    @Column(name = "storage_key", nullable = false, updatable = false)
    private String storageKey;

    @Column(name = "original_filename", nullable = false, updatable = false)
    private String originalFilename;

    @Column(name = "declared_content_type", updatable = false)
    private String declaredContentType;

    @Column(name = "detected_type")
    private String detectedType;

    @Column(name = "size_bytes")
    private Long sizeBytes;

    @Enumerated(EnumType.STRING)
    @Column(name = "upload_status", nullable = false)
    private UploadStatus uploadStatus = UploadStatus.PENDING;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "uploaded_by_user_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID uploadedByUserId;

    @Column(name = "completed_at", columnDefinition = "timestamp with time zone")
    private Instant completedAt;

    protected PartFile() {
    }

    PartFile(UUID partRevisionId, UUID customerOrgId, String storageKey, String originalFilename,
             String declaredContentType, UUID uploadedByUserId) {
        this.partRevisionId = partRevisionId;
        this.customerOrgId = customerOrgId;
        this.storageKey = storageKey;
        this.originalFilename = originalFilename;
        this.declaredContentType = declaredContentType;
        this.uploadedByUserId = uploadedByUserId;
    }

    void markCompleted(String detectedType, long sizeBytes, Instant at) {
        requirePending();
        this.detectedType = detectedType;
        this.sizeBytes = sizeBytes;
        this.uploadStatus = UploadStatus.COMPLETED;
        this.completedAt = at;
    }

    void markRejected(String detectedType, Long sizeBytes) {
        requirePending();
        this.detectedType = detectedType;
        this.sizeBytes = sizeBytes;
        this.uploadStatus = UploadStatus.REJECTED;
    }

    void markRemoved() {
        this.uploadStatus = UploadStatus.REMOVED;
    }

    private void requirePending() {
        if (uploadStatus != UploadStatus.PENDING) {
            throw new IllegalStateException("part file " + getId() + " is " + uploadStatus + ", not PENDING");
        }
    }

    UUID getPartRevisionId() {
        return partRevisionId;
    }

    UUID getCustomerOrgId() {
        return customerOrgId;
    }

    String getStorageKey() {
        return storageKey;
    }

    String getOriginalFilename() {
        return originalFilename;
    }

    String getDetectedType() {
        return detectedType;
    }

    Long getSizeBytes() {
        return sizeBytes;
    }

    UploadStatus getUploadStatus() {
        return uploadStatus;
    }

    UUID getUploadedByUserId() {
        return uploadedByUserId;
    }

    Instant getCompletedAt() {
        return completedAt;
    }
}
