package com.mfg.platform.identity;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

/**
 * 角色字典 —— 内部角色和外部角色<b>共用一张表</b>,靠 {@link Scope} 区分。
 *
 * <p>拆 scope 的作用:外部用户的角色只能来自 {@code scope=EXTERNAL} 的行,内部同理 ——
 * 授权时 service 校验「role.scope 和用户所在侧一致」,从而"外部人永远拿不到内部角色"。
 * (共用表 + 共用 {@link UserRole} 后,这条不再靠表结构死挡,改由 service 层保证,符合 §3。)
 *
 * <p>{@code code} 在同一 scope 内唯一;显示名走 {@code nameI18nKey}(§6 后端只返 code/key)。
 */
@Entity
@Table(name = "role")
public class Role extends BaseEntity {

    /** 角色作用侧。EXTERNAL=客户/供应商端;INTERNAL=运营端。 */
    public enum Scope {
        INTERNAL, EXTERNAL
    }

    public enum Status {
        ACTIVE, DISABLED
    }

    @Enumerated(EnumType.STRING)
    @Column(name = "scope", nullable = false)
    private Scope scope;

    @Column(name = "code", nullable = false)
    private String code;

    @Column(name = "name_i18n_key", nullable = false)
    private String nameI18nKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status = Status.ACTIVE;

    protected Role() {
        // JPA
    }

    public Role(Scope scope, String code, String nameI18nKey) {
        this.scope = scope;
        this.code = code;
        this.nameI18nKey = nameI18nKey;
        this.status = Status.ACTIVE;
    }

    public Scope getScope() {
        return scope;
    }

    public String getCode() {
        return code;
    }

    public String getNameI18nKey() {
        return nameI18nKey;
    }

    public void setNameI18nKey(String nameI18nKey) {
        this.nameI18nKey = nameI18nKey;
    }

    public Status getStatus() {
        return status;
    }

    public void setStatus(Status status) {
        this.status = status;
    }
}
