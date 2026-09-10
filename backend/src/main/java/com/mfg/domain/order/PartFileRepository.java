package com.mfg.domain.order;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** 图纸文件。所有查询都带客户组织条件(CLAUDE.md §3 铁律 2)。 */
interface PartFileRepository extends JpaRepository<PartFile, UUID> {

    Optional<PartFile> findByIdAndCustomerOrgId(UUID id, UUID customerOrgId);

    List<PartFile> findByPartRevisionIdInAndCustomerOrgIdOrderByCreatedAtAsc(Collection<UUID> partRevisionIds,
                                                                             UUID customerOrgId);
}
