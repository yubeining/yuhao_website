package com.mfg.domain.order;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
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

    /**
     * 带行锁取版本。改文件的操作（申请上传、上传完成、删文件）先锁版本再检查「是否已锁定」，
     * 和订单提交锁版本互斥 —— 否则「提交检查完图纸」和「删掉最后一份图纸」可以交错，两个都成功。
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from PartRevision r where r.id = :id and r.customerOrgId = :orgId")
    Optional<PartRevision> lockByIdAndCustomerOrgId(@Param("id") UUID id, @Param("orgId") UUID customerOrgId);

    /** 订单提交时锁住各行的版本。按 id 排序加锁：多个请求锁同一批版本时顺序一致，不会互相死锁。 */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from PartRevision r where r.id in :ids and r.customerOrgId = :orgId order by r.id")
    List<PartRevision> lockAllByIdIn(@Param("ids") Collection<UUID> ids, @Param("orgId") UUID customerOrgId);

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
