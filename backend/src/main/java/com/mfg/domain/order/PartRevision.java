package com.mfg.domain.order;

import com.mfg.platform.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/**
 * 零件图纸的一个版本 —— 挂在 {@link PartDesign} 下,每版一套文件({@link PartFile})。
 *
 * <p>版本号 {@code revNo} 由我方编,每个零件从 1 开始;客户文件名里的 A/B/C 放进
 * {@code customerRev},只展示、不参与任何判断(2026-09-10 拍板)。
 *
 * <p>订单行锁定的是本实体的 id,而不是 {@code partDesignId} —— CLAUDE.md §3 铁律 7。
 * 引用它的订单一提交,{@code lockedAt} 就有值,此后这一版不许再加 / 删文件
 * (2026-09-14 拍板:提交时锁)。
 *
 * <p>{@code customerOrgId} 冗余自 {@link PartDesign}:租户条件要直接进查询(§3 铁律 2)。
 * 零件归属不会变,所以归属列一律 {@code updatable = false},冗余不会漂移。
 */
@Entity
@Table(name = "part_revision")
class PartRevision extends BaseEntity {

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "part_design_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID partDesignId;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "customer_org_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID customerOrgId;

    @Column(name = "rev_no", nullable = false, updatable = false)
    private int revNo;

    @Column(name = "customer_rev")
    private String customerRev;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name = "created_by_user_id", columnDefinition = "uuid", nullable = false, updatable = false)
    private UUID createdByUserId;

    @Column(name = "locked_at", columnDefinition = "timestamp with time zone")
    private Instant lockedAt;

    protected PartRevision() {
    }

    PartRevision(UUID partDesignId, UUID customerOrgId, int revNo, String customerRev, UUID createdByUserId) {
        this.partDesignId = partDesignId;
        this.customerOrgId = customerOrgId;
        this.revNo = revNo;
        this.customerRev = customerRev;
        this.createdByUserId = createdByUserId;
    }

    UUID getPartDesignId() {
        return partDesignId;
    }

    UUID getCustomerOrgId() {
        return customerOrgId;
    }

    int getRevNo() {
        return revNo;
    }

    String getCustomerRev() {
        return customerRev;
    }

    /** 幂等:已经锁过的版本保持最早那次的锁定时间。 */
    void lock(Instant at) {
        if (lockedAt == null) {
            lockedAt = at;
        }
    }

    boolean isLocked() {
        return lockedAt != null;
    }

    Instant getLockedAt() {
        return lockedAt;
    }

    UUID getCreatedByUserId() {
        return createdByUserId;
    }
}
