package com.mfg.platform.identity;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

/** external_user 数据访问。 */
public interface ExternalUserRepository extends JpaRepository<ExternalUser, UUID> {

    Optional<ExternalUser> findByEmail(String email);

    boolean existsByEmail(String email);

    /** 本公司成员（租户隔离：调用方只能传自己的 orgId，见 §5）。 */
    Page<ExternalUser> findByOrgId(UUID orgId, Pageable pageable);

    /** 运营端：某家公司下的全部联系人（跨租户，仅运营端点用）。 */
    Page<ExternalUser> findByOrgIdOrderByCreatedAtDesc(UUID orgId, Pageable pageable);

    /**
     * 运营端账号列表：按邮箱 / 姓名 / <b>公司名</b> 模糊搜。
     *
     * <p>公司名走 {@code left join ... on}（实体连接）而不是数据库外键关联 ——
     * 本系统本来就不建外键（CLAUDE.md §4），这里只是查询时按 {@code org_id} 连一下。
     * 用 left join 是为了 org 缺失时用户仍然出现在列表里：宁可显示得难看，也不要静默丢行。
     */
    @Query("""
            select u from ExternalUser u
            left join Organization o on o.id = u.orgId
            where lower(u.email) like :q
               or lower(u.displayName) like :q
               or lower(o.name) like :q
            """)
    Page<ExternalUser> search(@Param("q") String query, Pageable pageable);
}
