package com.mfg.platform.identity;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/**
 * 供应商邀请。供应商账号只能凭运营发的邀请建（2026-09-18 需求方拍板，设计文档 11）。
 *
 * <p>只存 token 的 SHA-256；明文只出现在生成时的响应里。链接 7 天有效、用一次失效、运营可作废。
 * 「用掉」靠 {@link SupplierInviteRepository#consume} 的条件更新，不靠这里的 setter —— 两个人同时拿同一条链接注册，只有一个能成功。
 */
@Entity
@Table(name = "supplier_invite")
class SupplierInvite extends BaseEntity {

    enum Status {
        PENDING, USED, EXPIRED, REVOKED
    }

    @Column(name = "token_hash", nullable = false, updatable = false, unique = true)
    private String tokenHash;

    @Column(name = "org_name", nullable = false, updatable = false)
    private String orgName;

    @Column(name = "email", nullable = false, updatable = false)
    private String email;

    @Column(name = "expires_at", columnDefinition = "timestamp with time zone", nullable = false, updatable = false)
    private Instant expiresAt;

    @Column(name = "used_at", columnDefinition = "timestamp with time zone")
    private Instant usedAt;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "used_by_org_id", columnDefinition = "uuid")
    private UUID usedByOrgId;

    @Column(name = "revoked_at", columnDefinition = "timestamp with time zone")
    private Instant revokedAt;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "created_by_user_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID createdByUserId;

    protected SupplierInvite() {
    }

    SupplierInvite(String tokenHash, String orgName, String email, Instant expiresAt, UUID createdByUserId) {
        this.tokenHash = tokenHash;
        this.orgName = orgName;
        this.email = email;
        this.expiresAt = expiresAt;
        this.createdByUserId = createdByUserId;
    }

    Status statusAt(Instant now) {
        if (usedAt != null) {
            return Status.USED;
        }
        if (revokedAt != null) {
            return Status.REVOKED;
        }
        return now.isBefore(expiresAt) ? Status.PENDING : Status.EXPIRED;
    }

    String getOrgName() {
        return orgName;
    }

    String getEmail() {
        return email;
    }

    Instant getExpiresAt() {
        return expiresAt;
    }

    Instant getUsedAt() {
        return usedAt;
    }

    Instant getRevokedAt() {
        return revokedAt;
    }
}
