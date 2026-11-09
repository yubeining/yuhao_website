package com.mfg.platform.identity;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

/** ops_user 数据访问。email 登录前统一小写规整，故按精确 email 查。 */
public interface OpsUserRepository extends JpaRepository<OpsUser, UUID> {

    Optional<OpsUser> findByEmail(String email);

    boolean existsByEmail(String email);

    /** 运营端：运营账号列表，按邮箱 / 姓名 / 所属部门名模糊搜（同 {@link ExternalUserRepository#search}）。 */
    @Query("""
            select u from OpsUser u
            left join Organization o on o.id = u.orgId
            where lower(u.email) like :q
               or lower(u.displayName) like :q
               or lower(o.name) like :q
            """)
    Page<OpsUser> search(@Param("q") String query, Pageable pageable);
}
