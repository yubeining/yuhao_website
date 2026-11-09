package com.mfg.platform.identity;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/** organization 数据访问。列表分页用继承的 find* 派生查询。 */
public interface OrganizationRepository extends JpaRepository<Organization, UUID> {

    List<Organization> findByTypeOrderByCreatedAtDesc(Organization.Type type);

    Page<Organization> findByOrderByCreatedAtDesc(Pageable pageable);

    Page<Organization> findByTypeOrderByCreatedAtDesc(Organization.Type type, Pageable pageable);

    Page<Organization> findByNameContainingIgnoreCaseOrderByCreatedAtDesc(String name, Pageable pageable);

    Page<Organization> findByTypeAndNameContainingIgnoreCaseOrderByCreatedAtDesc(
            Organization.Type type, String name, Pageable pageable);
}
