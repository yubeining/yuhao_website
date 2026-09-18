package com.mfg.platform.identity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/** organization 数据访问。列表分页用继承的 findAll(Pageable)。 */
public interface OrganizationRepository extends JpaRepository<Organization, UUID> {

    List<Organization> findByTypeOrderByCreatedAtDesc(Organization.Type type);
}
