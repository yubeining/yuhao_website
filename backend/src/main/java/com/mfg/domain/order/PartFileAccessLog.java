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
 * <p>本轮(2026-09-10)只存:不做导出(红线 1 后半句明确推迟)、不存 IP。
 * 业务上下文(哪张报价单/订单)要等第 2 步有订单上下文时再加列。
 */
@Entity
@Immutable
@Table(name = "part_file_access_log")
class PartFileAccessLog {

    enum AccessType {
        SIGNED_URL_ISSUED
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

    @Column(name = "trace_id", updatable = false)
    private String traceId;

    @Column(name = "accessed_at", columnDefinition = "timestamp with time zone", nullable = false, updatable = false)
    private Instant accessedAt;

    protected PartFileAccessLog() {
    }

    PartFileAccessLog(UUID partFileId, UUID partRevisionId, UUID customerOrgId,
                      UUID accessorUserId, PartyType accessorPartyType, UUID accessorOrgId,
                      AccessType accessType, String traceId, Instant accessedAt) {
        this.partFileId = partFileId;
        this.partRevisionId = partRevisionId;
        this.customerOrgId = customerOrgId;
        this.accessorUserId = accessorUserId;
        this.accessorPartyType = accessorPartyType;
        this.accessorOrgId = accessorOrgId;
        this.accessType = accessType;
        this.traceId = traceId;
        this.accessedAt = accessedAt;
    }
}
