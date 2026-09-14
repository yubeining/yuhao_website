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
 * 图纸访问审计 —— 红线 1 / CLAUDE.md §3 铁律 6。每签发一次查看 URL 就是一行。
 *
 * <p>只增不改:{@link Immutable} + 全列 {@code updatable = false}。
 * 高频日志表,{@code bigserial} 主键,不继承 {@code BaseEntity}(没有 version / updated_at)。
 *
 * <p>只存不导(红线 1 后半句明确推迟)、不存 IP(2026-09-10 拍板)。
 * 业务上下文 {@code contextType + contextId}:在哪张订单里看的图(2026-09-14 第 2 步加)。
 * 两者要么都空、要么都有值,库里有 CHECK 约束兜底。
 */
@Entity
@Immutable
@Table(name = "part_file_access_log")
class PartFileAccessLog {

    enum AccessType {
        SIGNED_URL_ISSUED
    }

    enum ContextType {
        CUSTOMER_ORDER
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false, updatable = false)
    private Long id;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "part_file_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID partFileId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "part_revision_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID partRevisionId;

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

    @Enumerated(EnumType.STRING)
    @Column(name = "access_type", nullable = false, updatable = false)
    private AccessType accessType;

    @Enumerated(EnumType.STRING)
    @Column(name = "context_type", updatable = false)
    private ContextType contextType;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "context_id", columnDefinition = "uuid", updatable = false)
    private UUID contextId;

    @Column(name = "trace_id", updatable = false)
    private String traceId;

    @Column(name = "accessed_at", columnDefinition = "timestamp with time zone", nullable = false, updatable = false)
    private Instant accessedAt;

    protected PartFileAccessLog() {
    }

    PartFileAccessLog(UUID partFileId, UUID partRevisionId, UUID customerOrgId,
                      UUID accessorUserId, PartyType accessorPartyType, UUID accessorOrgId,
                      AccessType accessType, ContextType contextType, UUID contextId,
                      String traceId, Instant accessedAt) {
        this.partFileId = partFileId;
        this.partRevisionId = partRevisionId;
        this.customerOrgId = customerOrgId;
        this.accessorUserId = accessorUserId;
        this.accessorPartyType = accessorPartyType;
        this.accessorOrgId = accessorOrgId;
        this.accessType = accessType;
        this.contextType = contextType;
        this.contextId = contextId;
        this.traceId = traceId;
        this.accessedAt = accessedAt;
    }
}
