package com.mfg.platform.auth;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * 外部组织（客户公司 / 供应商公司）。登录时用来判定"这个人属于客户还是供应商"。
 *
 * <p>只映射登录 / 展示需要的几列（type / status / name）—— 本类只读，不 INSERT party，
 * 所以不必映射全部列（validate 只校验被映射的列存在）。运营不是 party（见 D23）。
 */
@Entity
@Table(name = "party")
public class Party extends BaseEntity {

    /** CUSTOMER | SUPPLIER（D23 收窄后不再有 OPERATOR）。 */
    @Column(name = "type", nullable = false)
    private String type;

    /** PENDING | ACTIVE | SUSPENDED。 */
    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "name", nullable = false)
    private String name;

    protected Party() {
    }

    public String getType() {
        return type;
    }

    public String getStatus() {
        return status;
    }

    public String getName() {
        return name;
    }
}
