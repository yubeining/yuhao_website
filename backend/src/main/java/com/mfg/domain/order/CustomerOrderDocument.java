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
 * 随货文件（质检报告 / 材质证明，2026-11-24 拍板不分类）：运营上传，挂在客户订单下，客户能下载。
 *
 * <p>上传和图纸一样是两段式：申请时建 {@code PENDING} 行 + 签名 PUT；字节进桶后 complete 读文件头判类型，
 * 对得上 {@code COMPLETED}、对不上 {@code REJECTED}。只有 COMPLETED 的能签下载链接。
 * 本轮没有删除（需求没提）。
 */
@Entity
@Table(name = "customer_order_document")
class CustomerOrderDocument extends BaseEntity {

    enum UploadStatus {
        PENDING, COMPLETED, REJECTED
    }

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_order_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID customerOrderId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_org_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID customerOrgId;

    // complete 时换成服务端挪过去的新地址，所以不是只写一次
    @Column(name = "storage_key", nullable = false)
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
    @Column(name = "uploaded_by_ops_user_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID uploadedByOpsUserId;

    @Column(name = "completed_at", columnDefinition = "timestamp with time zone")
    private Instant completedAt;

    protected CustomerOrderDocument() {
    }

    CustomerOrderDocument(UUID customerOrderId, UUID customerOrgId, String storageKey, String originalFilename,
                          String declaredContentType, UUID uploadedByOpsUserId) {
        this.customerOrderId = customerOrderId;
        this.customerOrgId = customerOrgId;
        this.storageKey = storageKey;
        this.originalFilename = originalFilename;
        this.declaredContentType = declaredContentType;
        this.uploadedByOpsUserId = uploadedByOpsUserId;
    }

    UUID getCustomerOrderId() {
        return customerOrderId;
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

    Long getSizeBytes() {
        return sizeBytes;
    }

    UploadStatus getUploadStatus() {
        return uploadStatus;
    }

    Instant getCompletedAt() {
        return completedAt;
    }
}
