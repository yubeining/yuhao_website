package com.mfg.platform.identity;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/** external_user 数据访问。 */
public interface ExternalUserRepository extends JpaRepository<ExternalUser, UUID> {

    Optional<ExternalUser> findByEmail(String email);

    boolean existsByEmail(String email);

    /** 本公司成员（租户隔离：调用方只能传自己的 orgId，见 §5）。 */
    Page<ExternalUser> findByOrgId(UUID orgId, Pageable pageable);
}
