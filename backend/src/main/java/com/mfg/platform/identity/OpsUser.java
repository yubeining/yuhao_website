package com.mfg.platform.identity;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

/**
 * 内部用户(运营 / 管理)—— 和外部的 {@link ExternalUser} <b>物理隔离</b>(不同表)。
 *
 * <p>拆表理由:内部是我们自己的员工,外部是客户 / 供应商,两者登录方式、生命周期、字段、
 * email 唯一性命名空间都不同。放一张表里,一个漏了受众过滤的查询就可能把内部账号返给外部端。
 *
 * <p>{@code orgId} 指向一个 {@code type=INTERNAL} 的 {@link Organization}(裸 uuid,无外键)。
 */
@Entity
@Table(name = "ops_user")
public class OpsUser extends BaseEntity {

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

    protected OpsUser() {
        // JPA
    }

    public OpsUser(UUID orgId, String email, String displayName, String passwordHash) {
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
}
