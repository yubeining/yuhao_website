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

/** 图纸文件。所有查询都带客户组织条件(CLAUDE.md §3 铁律 2)。 */
interface PartFileRepository extends JpaRepository<PartFile, UUID> {

    Optional<PartFile> findByIdAndCustomerOrgId(UUID id, UUID customerOrgId);

    List<PartFile> findByPartRevisionIdInAndCustomerOrgIdAndUploadStatusOrderByCreatedAtAsc(
            Collection<UUID> partRevisionIds, UUID customerOrgId, PartFile.UploadStatus uploadStatus);

    /** 这些版本里，哪些至少有一份传完的文件 —— 订单提交前校验用。 */
    @Query("select distinct f.partRevisionId from PartFile f"
            + " where f.partRevisionId in :revisionIds and f.customerOrgId = :orgId and f.uploadStatus = :status")
    List<UUID> findRevisionIdsHavingStatus(@Param("revisionIds") Collection<UUID> revisionIds,
                                           @Param("orgId") UUID customerOrgId,
                                           @Param("status") PartFile.UploadStatus status);

    /**
     * 条件状态迁移：只改「当前状态在 {@code from} 里、且所属版本未锁定」的那一行，返回改到的行数。
     *
     * <p>并发 / 重试靠它：两个请求同时 complete，只有一个改到行（返回 1），另一个返回 0，
     * 由调用方重新读状态决定怎么回，不会撞乐观锁变 500。版本锁定条件写在同一条 SQL 里，
     * 「锁定前申请上传、锁定后 complete」钻不过去。
     *
     * <p>批量更新绕过 {@code @Version} 和 JPA 审计，所以 version / updated_at 在这里手动维护；
     * {@code clearAutomatically} 让随后的查询读到库里的新状态，而不是持久化上下文里的旧实体。
     */
    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update PartFile f set f.uploadStatus = :to, f.detectedType = :detectedType, f.sizeBytes = :sizeBytes,"
            + " f.completedAt = :completedAt, f.updatedAt = :now, f.version = f.version + 1"
            + " where f.id = :id and f.customerOrgId = :orgId and f.uploadStatus in :from"
            + " and not exists (select r.id from PartRevision r where r.id = f.partRevisionId and r.lockedAt is not null)")
    int transitionIfRevisionUnlocked(@Param("id") UUID id,
                                     @Param("orgId") UUID customerOrgId,
                                     @Param("from") Collection<PartFile.UploadStatus> from,
                                     @Param("to") PartFile.UploadStatus to,
                                     @Param("detectedType") String detectedType,
                                     @Param("sizeBytes") Long sizeBytes,
                                     @Param("completedAt") Instant completedAt,
                                     @Param("now") Instant now);
}
