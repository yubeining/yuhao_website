package com.mfg.support;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

/**
 * 集成测试基类 —— 真 PostgreSQL + 真 Redis（§9），每个测试前把状态清干净，测试之间互不串味。
 *
 * <p>子类直接继承即可，不用重复 {@code @SpringBootTest} / 清理逻辑。需要 HTTP 的用例
 * （真 Tomcat + TestRestTemplate）另配 {@code RANDOM_PORT}，不走这个基类。
 *
 * <p>清理：每个测试前 TRUNCATE 所有业务表（RESTART IDENTITY CASCADE）+ flush 测试专用 Redis db。
 * 测试库由 JPA create-drop 建（见 application-test.yml），所以直接扫 information_schema 拿表名。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
public abstract class AbstractIntegrationTest {

    @Autowired
    protected JdbcTemplate jdbc;

    @Autowired
    private StringRedisTemplate redis;

    @BeforeEach
    void resetState() {
        truncateAllTables();
        flushRedis();
    }

    private void truncateAllTables() {
        List<String> tables = jdbc.queryForList(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public'", String.class);
        if (tables.isEmpty()) {
            return;
        }
        String joined = String.join(", ", tables.stream().map(t -> "\"" + t + "\"").toList());
        jdbc.execute("TRUNCATE TABLE " + joined + " RESTART IDENTITY CASCADE");
    }

    private void flushRedis() {
        redis.execute((org.springframework.data.redis.connection.RedisConnection c) -> {
            c.serverCommands().flushDb();
            return null;
        });
    }
}
