package com.mfg.platform.auth;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/**
 * 外部用户（客户 / 供应商的人）—— 和内部运营 {@link OpsUser} 物理隔离（D23）。
 *
 * <p>email / phone 的唯一性只在外部命名空间内（迁移里的部分唯一索引），和运营互不干扰。
 * 属于哪个 party（客户还是供应商）由 {@link #partyId} 指向的 {@link Party} 决定。
 *
 * <p>关联用裸 uuid（{@code partyId}），不建 JPA 关联（CLAUDE.md §4）。
 */
@Entity
@Table(name = "party_user")
public class PartyUser extends BaseEntity {

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "party_id", columnDefinition = "uuid", nullable = false)
    private UUID partyId;

    @Column(name = "email")
    private String email;

    @Column(name = "phone")
    private String phone;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    /** ADMIN | MEMBER（端内角色，不是受众）。 */
    @Column(name = "role", nullable = false)
    private String role;

    @Column(name = "password_hash")
    private String passwordHash;

    /** ACTIVE | DISABLED。 */
    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "locale", nullable = false)
    private String locale;

    @Column(name = "last_login_at", columnDefinition = "timestamp with time zone")
    private Instant lastLoginAt;

    protected PartyUser() {
    }

    public PartyUser(UUID partyId, String email, String phone, String displayName,
                     String role, String passwordHash, String locale) {
        this.partyId = partyId;
        this.email = email;
        this.phone = phone;
        this.displayName = displayName;
        this.role = role;
        this.passwordHash = passwordHash;
        this.status = "ACTIVE";
        this.locale = locale;
    }

    public UUID getPartyId() {
        return partyId;
    }

    public String getEmail() {
        return email;
    }

    public String getPhone() {
        return phone;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getRole() {
        return role;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getStatus() {
        return status;
    }

    public String getLocale() {
        return locale;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }

    public void setLastLoginAt(Instant lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }
}
