package com.mfg.platform.access;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.UUID;

/**
 * 查 {@code access_grant} 表。
 *
 * <p><b>为什么用 JdbcTemplate 而不是 JPA 实体</b>：这张表只被
 * {@link AccessInterceptor} 读，在<b>请求进入 controller 之前</b>就要用到 ——
 * 那时还没有 {@code @Transactional} 上下文。给它建实体 + repository
 * 只会多一层 Hibernate 一级缓存和懒加载的坑，而它的查询永远只有这一句。
 *
 * <p><b>没有加缓存是刻意的</b>（CLAUDE.md §8：不强制缓存，有实测热点才加）。
 * ops 端只有我们自己人用，量级是每天几百次请求；为它引入缓存，
 * 就要同步处理「刚给某人授权，他要等 5 分钟才生效」的失效问题 —— 不划算。
 */
@Repository
public class AccessGrantRepository {

    private static final String EXISTS_SQL = """
            SELECT EXISTS (
                SELECT 1 FROM access_grant
                 WHERE user_id = ?
                   AND resource_key = ?
                   AND action = ?
                   AND (expires_at IS NULL OR expires_at > now())
            )""";

    private final JdbcTemplate jdbc;

    public AccessGrantRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * @param action READ 或 WRITE
     * @return 该用户是否持有未过期的授权
     */
    public boolean hasGrant(UUID userId, String resourceKey, String action) {
        Boolean result = jdbc.queryForObject(EXISTS_SQL, Boolean.class, userId, resourceKey, action);
        return Boolean.TRUE.equals(result);
    }
}
