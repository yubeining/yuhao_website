package com.mfg.platform.identity;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

/**
 * 组织 / 公司 —— 内部我方、客户公司、供应商公司<b>共用一张表</b>,靠 {@link Type} 区分。
 *
 * <p>{@code type} 是<b>受众的来源</b>:外部用户属于哪个 org、org 是 CUSTOMER 还是 SUPPLIER,
 * 合起来决定他登录后进哪个端(CLAUDE.md §3 端级隔离)。受众是结构性的(在哪张用户表 + 本 type),
 * 不做成角色行 —— 改一行数据就能跨端是本系统头号风险。
 */
@Entity
@Table(name = "organization")
public class Organization extends BaseEntity {

    /** 组织类型。INTERNAL=我方(对应 OPERATOR 端);CUSTOMER/SUPPLIER=外部两端。 */
    public enum Type {
        INTERNAL, CUSTOMER, SUPPLIER
    }

    public enum Status {
        ACTIVE, DISABLED
    }

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false)
    private Type type;

    @Column(name = "name", nullable = false)
    private String name;

    /** ISO 3166-1 alpha-2。 */
    @Column(name = "country")
    private String country;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status = Status.ACTIVE;

    protected Organization() {
        // JPA
    }

    public Organization(Type type, String name, String country) {
        this.type = type;
        this.name = name;
        this.country = country;
        this.status = Status.ACTIVE;
    }

    public Type getType() {
        return type;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getCountry() {
        return country;
    }

    public void setCountry(String country) {
        this.country = country;
    }

    public Status getStatus() {
        return status;
    }

    public void setStatus(Status status) {
        this.status = status;
    }
}
