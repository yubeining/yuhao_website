package com.mfg.platform.dict;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 数据字典 / 选项主数据(单表)—— 用 {@code type} 分组,每行是一个选项。
 *
 * <p>驱动下拉框和枚举校验,堵住 §4/C5 "编造下拉选项"的坑:选项从这里读,不各写各的。
 * 取某类:{@code where type=? and status='ACTIVE' order by sort_order},不用 join。
 *
 * <p>{@code names} 存多语显示名({@code {"en":..,"zh":..}}):字典项是运营会增的<b>数据</b>,
 * 不是静态 UI 文案,所以显示名随数据走,加一个选项不用等前端发版加翻译。业务代码只认
 * {@code type + code},永不手写选项。
 */
@Entity
@Table(name = "dict")
public class Dict extends BaseEntity {

    public enum Status {
        ACTIVE, DISABLED
    }

    @Column(name = "type", nullable = false)
    private String type;

    @Column(name = "code", nullable = false)
    private String code;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "names", columnDefinition = "jsonb", nullable = false)
    private Map<String, String> names = new LinkedHashMap<>();

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status = Status.ACTIVE;

    protected Dict() {
        // JPA
    }

    public Dict(String type, String code, Map<String, String> names, int sortOrder) {
        this.type = type;
        this.code = code;
        this.names = names == null ? new LinkedHashMap<>() : names;
        this.sortOrder = sortOrder;
        this.status = Status.ACTIVE;
    }

    public String getType() {
        return type;
    }

    public String getCode() {
        return code;
    }

    public Map<String, String> getNames() {
        return names;
    }

    public void setNames(Map<String, String> names) {
        this.names = names;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    public Status getStatus() {
        return status;
    }

    public void setStatus(Status status) {
        this.status = status;
    }
}
