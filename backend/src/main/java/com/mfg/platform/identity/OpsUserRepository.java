package com.mfg.platform.identity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/** ops_user 数据访问。email 登录前统一小写规整，故按精确 email 查。 */
public interface OpsUserRepository extends JpaRepository<OpsUser, UUID> {

    Optional<OpsUser> findByEmail(String email);
}
