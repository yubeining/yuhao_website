package com.mfg.domain.order;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** 图纸版本。所有查询都带客户组织条件(CLAUDE.md §3 铁律 2)。 */
interface PartRevisionRepository extends JpaRepository<PartRevision, UUID> {

    Optional<PartRevision> findByIdAndPartDesignIdAndCustomerOrgId(UUID id, UUID partDesignId, UUID customerOrgId);

    Optional<PartRevision> findByIdAndCustomerOrgId(UUID id, UUID customerOrgId);

    List<PartRevision> findByIdInAndCustomerOrgId(Collection<UUID> ids, UUID customerOrgId);

    /** 同一图号再次下单时沿用的版本：这个零件最近一次被提交的订单锁定的那一版（2026-09-14 拍板）。 */
    Optional<PartRevision> findTopByPartDesignIdAndCustomerOrgIdAndLockedAtIsNotNullOrderByRevNoDesc(
            UUID partDesignId, UUID customerOrgId);

    /** 订单提交时锁定各行版本。已经锁过的保持最早的锁定时间。批量更新手动维护 version / updated_at。 */
    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update PartRevision r set r.lockedAt = :at, r.updatedAt = :at, r.version = r.version + 1"
            + " where r.id in :ids and r.customerOrgId = :orgId and r.lockedAt is null")
    int lockAll(@Param("ids") Collection<UUID> ids, @Param("orgId") UUID customerOrgId, @Param("at") Instant at);

    List<PartRevision> findByPartDesignIdAndCustomerOrgIdOrderByRevNoAsc(UUID partDesignId, UUID customerOrgId);

    /** 当前最大版本号,算下一版用。并发撞号由 (part_design_id, rev_no) 唯一索引兜底。 */
    Optional<PartRevision> findTopByPartDesignIdAndCustomerOrgIdOrderByRevNoDesc(UUID partDesignId, UUID customerOrgId);
}
