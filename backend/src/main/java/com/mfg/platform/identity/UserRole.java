package com.mfg.platform.identity;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

/**
 * 用户 ↔ 角色(多对多)—— 内外<b>共用一张表</b>。
 *
 * <p>{@code userId} 指向 {@link OpsUser} 或 {@link ExternalUser}(裸 uuid,uuid 全局不撞,
 * 按 userId 查回角色无需知道在哪张表)。授权时由 service 保证 user 所在侧与
 * {@link Role.Scope} 一致 —— 表结构本身不拦(无外键,§3 完整性在 service 层)。
 */
@Entity
@Table(name = "user_role")
public class UserRole extends BaseEntity {

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "user_id", columnDefinition = "uuid", nullable = false)
    private UUID userId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "role_id", columnDefinition = "uuid", nullable = false)
    private UUID roleId;

    /** 授权人(ops_user.id),可空。 */
    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "granted_by", columnDefinition = "uuid")
    private UUID grantedBy;

    protected UserRole() {
        // JPA
    }

    public UserRole(UUID userId, UUID roleId, UUID grantedBy) {
        this.userId = userId;
        this.roleId = roleId;
        this.grantedBy = grantedBy;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getRoleId() {
        return roleId;
    }

    public UUID getGrantedBy() {
        return grantedBy;
    }
}
