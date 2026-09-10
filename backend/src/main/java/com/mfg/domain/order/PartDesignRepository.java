package com.mfg.domain.order;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/** 零件主数据。所有按 id 取的方法都带客户组织条件(CLAUDE.md §3 铁律 2)。 */
interface PartDesignRepository extends JpaRepository<PartDesign, UUID> {

    Optional<PartDesign> findByIdAndCustomerOrgId(UUID id, UUID customerOrgId);

    /** 同一客户同一图号 = 同一个零件(D16)。 */
    boolean existsByCustomerOrgIdAndCode(UUID customerOrgId, String code);
}
