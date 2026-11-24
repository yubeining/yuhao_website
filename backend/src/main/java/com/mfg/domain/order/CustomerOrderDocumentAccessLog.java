package com.mfg.domain.order;

import com.mfg.common.security.PartyType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/**
 * 随货文件下载审计（CLAUDE.md §3 铁律 6）：每签发一次下载链接一行，谁 / 何时 / 哪个文件 / 哪张订单。
 * 只增不改，bigserial 主键，不继承 BaseEntity。和图纸审计一样不存 IP（2026-09-10 拍板）。
 */
@Entity
@Immutable
@Table(name = "customer_order_document_access_log")
class CustomerOrderDocumentAccessLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false, updatable = false)
    private Long id;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "document_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID documentId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_order_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID customerOrderId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_org_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID customerOrgId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "accessor_user_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID accessorUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "accessor_party_type", nullable = false, updatable = false)
    private PartyType accessorPartyType;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "accessor_org_id", columnDefinition = "uuid", updatable = false)
    private UUID accessorOrgId;

    @Column(name = "trace_id", updatable = false)
    private String traceId;

    @Column(name = "accessed_at", columnDefinition = "timestamp with time zone", nullable = false, updatable = false)
    private Instant accessedAt;

    protected CustomerOrderDocumentAccessLog() {
    }

    CustomerOrderDocumentAccessLog(UUID documentId, UUID customerOrderId, UUID customerOrgId, UUID accessorUserId,
                                   PartyType accessorPartyType, UUID accessorOrgId, String traceId,
                                   Instant accessedAt) {
        this.documentId = documentId;
        this.customerOrderId = customerOrderId;
        this.customerOrgId = customerOrgId;
        this.accessorUserId = accessorUserId;
        this.accessorPartyType = accessorPartyType;
        this.accessorOrgId = accessorOrgId;
        this.traceId = traceId;
        this.accessedAt = accessedAt;
    }
}
