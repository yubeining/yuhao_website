package com.mfg.domain.order;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** 零件主数据。所有按 id 取的方法都带客户组织条件(CLAUDE.md §3 铁律 2)。 */
interface PartDesignRepository extends JpaRepository<PartDesign, UUID> {

    Optional<PartDesign> findByIdAndCustomerOrgId(UUID id, UUID customerOrgId);

    List<PartDesign> findByIdInAndCustomerOrgId(Collection<UUID> ids, UUID customerOrgId);

    /** 派单用（运营 / 供应商端，跨客户）：id 来自生产订单的行，不来自请求。 */
    List<PartDesign> findByIdIn(Collection<UUID> ids);
}
