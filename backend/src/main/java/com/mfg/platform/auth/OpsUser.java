package com.mfg.platform.auth;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * 运营员工（内部用户）—— 和外部的客户 / 供应商（{@code party_user}）<b>物理隔离</b>。
 *
 * <p>拆开的理由（2026-09-07 决策）：运营是我们自己的员工，客户/供应商是外部人群，
 * 两者的登录方式、生命周期、字段、email 唯一性命名空间都不同。放一张表里，一个漏了
 * 受众过滤的查询就可能把运营账号返给外部端 —— 而本系统头号风险正是跨端泄露。
 *
 * <p>这是第一个继承 {@link BaseEntity} 的实体：UUID 主键、Instant 时间戳都从基类来。
 * 内部 RBAC 走 {@code access_grant}（其 user_id 现在就是本表的 id）。
 *
 * <p><b>登录还没接。</b>本类目前只建模 + 建仓库，真实登录（企微扫码 / 邮箱密码）
 * 单独做，届时才会写入和读取它。
 */
@Entity
@Table(name = "ops_user")
public class OpsUser extends BaseEntity {

    public enum Status {
        ACTIVE, DISABLED
    }

    @Column(name = "email")
    private String email;

    @Column(name = "wework_id")
    private String weworkId;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "password_hash")
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status = Status.ACTIVE;

    @Column(name = "last_login_at", columnDefinition = "timestamp with time zone")
    private Instant lastLoginAt;

    protected OpsUser() {
        // JPA
    }

    public OpsUser(String email, String weworkId, String displayName, String passwordHash) {
        this.email = email;
        this.weworkId = weworkId;
        this.displayName = displayName;
        this.passwordHash = passwordHash;
        this.status = Status.ACTIVE;
    }

    public String getEmail() {
        return email;
    }

    public String getWeworkId() {
        return weworkId;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public Status getStatus() {
        return status;
    }

    public void setStatus(Status status) {
        this.status = status;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }

    public void setLastLoginAt(Instant lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }
}
