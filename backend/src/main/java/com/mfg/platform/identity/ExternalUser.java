package com.mfg.platform.identity;

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
 * 外部用户(客户 / 供应商联系人)—— 和内部 {@link OpsUser} 物理隔离。
 *
 * <p>他是客户还是供应商,不看本表,而看 {@code orgId} 指向的 {@link Organization} 的
 * {@code type}(CUSTOMER / SUPPLIER)。一人一公司:{@code orgId} 单值,公司内的多个角色走
 * {@link UserRole}。
 */
@Entity
@Table(name = "external_user")
public class ExternalUser extends BaseEntity {

    public enum Status {
        ACTIVE, DISABLED
    }

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "org_id", columnDefinition = "uuid", nullable = false)
    private UUID orgId;

    @Column(name = "email", nullable = false)
    private String email;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status = Status.ACTIVE;

    @Column(name = "locale")
    private String locale;

    /**
     * 第一次通过邮箱验证码证明归属的时间；为空 = 从未验证过。
     *
     * <p>只记「证明过」，不记「验证了多少次」—— 后者属于审计，不该塞进主表。
     */
    @Column(name = "email_verified_at", columnDefinition = "timestamp with time zone")
    private Instant emailVerifiedAt;

    protected ExternalUser() {
        // JPA
    }

    public ExternalUser(UUID orgId, String email, String displayName, String passwordHash) {
        this.orgId = orgId;
        this.email = email;
        this.displayName = displayName;
        this.passwordHash = passwordHash;
        this.status = Status.ACTIVE;
    }

    public UUID getOrgId() {
        return orgId;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public Status getStatus() {
        return status;
    }

    public void setStatus(Status status) {
        this.status = status;
    }

    public String getLocale() {
        return locale;
    }

    public void setLocale(String locale) {
        this.locale = locale;
    }

    public Instant getEmailVerifiedAt() {
        return emailVerifiedAt;
    }

    /** 幂等：已经验证过就不覆盖第一次的时间。 */
    public void markEmailVerified(Instant at) {
        if (this.emailVerifiedAt == null) {
            this.emailVerifiedAt = at;
        }
    }
}
