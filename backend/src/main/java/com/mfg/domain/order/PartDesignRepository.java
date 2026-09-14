package com.mfg.domain.order;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** 零件主数据。所有按 id 取的方法都带客户组织条件(CLAUDE.md §3 铁律 2)。 */
interface PartDesignRepository extends JpaRepository<PartDesign, UUID> {

    Optional<PartDesign> findByIdAndCustomerOrgId(UUID id, UUID customerOrgId);

    /** 按图号取（D16）。图号精确匹配，只由调用方去掉首尾空格。 */
    Optional<PartDesign> findByCustomerOrgIdAndCode(UUID customerOrgId, String code);

    List<PartDesign> findByIdInAndCustomerOrgId(Collection<UUID> ids, UUID customerOrgId);

    /** 同一客户同一图号 = 同一个零件(D16)。 */
    boolean existsByCustomerOrgIdAndCode(UUID customerOrgId, String code);
}
