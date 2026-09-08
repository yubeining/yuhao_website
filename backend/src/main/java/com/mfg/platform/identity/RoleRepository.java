package com.mfg.platform.identity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/** role 数据访问。 */
public interface RoleRepository extends JpaRepository<Role, UUID> {
}
