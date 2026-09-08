package com.mfg.platform.identity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/** user_role 数据访问。user_id 全局唯一（uuid），无需区分指向哪张用户表。 */
public interface UserRoleRepository extends JpaRepository<UserRole, UUID> {

    List<UserRole> findByUserId(UUID userId);
}
