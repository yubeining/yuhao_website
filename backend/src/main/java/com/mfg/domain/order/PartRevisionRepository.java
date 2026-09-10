package com.mfg.domain.order;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** 图纸版本。所有查询都带客户组织条件(CLAUDE.md §3 铁律 2)。 */
interface PartRevisionRepository extends JpaRepository<PartRevision, UUID> {

    Optional<PartRevision> findByIdAndPartDesignIdAndCustomerOrgId(UUID id, UUID partDesignId, UUID customerOrgId);

    List<PartRevision> findByPartDesignIdAndCustomerOrgIdOrderByRevNoAsc(UUID partDesignId, UUID customerOrgId);

    /** 当前最大版本号,算下一版用。并发撞号由 (part_design_id, rev_no) 唯一索引兜底。 */
    Optional<PartRevision> findTopByPartDesignIdAndCustomerOrgIdOrderByRevNoDesc(UUID partDesignId, UUID customerOrgId);
}
