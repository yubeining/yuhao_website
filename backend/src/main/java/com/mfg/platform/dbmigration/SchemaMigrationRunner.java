package com.mfg.platform.dbmigration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 开机自动应用数据库迁移。
 *
 * <p><b>为什么自己写而不用 Flyway/Liquibase</b>：需求很简单（按字典序跑一遍 SQL、
 * 记录已跑过的、多 pod 别打架），而 Flyway 的版本号规则、Liquibase 的 changelog XML
 * 都是额外的心智负担。这个类一百多行，行为完全可预测。
 * 如果将来需要 rollback / baseline / 分支合并这些高级功能，再换不迟。
 *
 * <p><b>执行时机</b>：必须在 EntityManagerFactory 初始化<b>之前</b>跑完，
 * 否则 {@code ddl-auto: validate} 会因为缺列而启动失败。
 * 用 {@code EntityManagerFactoryDependsOnPostProcessor} 建立依赖关系（见同包下的配置类）。
 *
 * <p><b>多 pod 安全</b>：靠 Postgres 的 {@code pg_advisory_lock}。
 * 并发启动的 pod 在锁上排队，第一个跑完迁移，后面的进来发现都已应用，直接放行。
 *
 * <p><b>漂移检测</b>：按 {@code (文件名, 内容 SHA-256)} 判定是否已应用。
 * 已应用文件的内容被改过 → 启动直接失败。
 * 这是刻意的：改一个已经在生产跑过的迁移，本地库和生产库就永久不一致了，
 * 而且没有任何东西会告诉你。要么撤销修改，要么新开一个迁移文件。
 *
 * <p><b>已存在数据库的保护</b>：如果 {@code schema_migrations} 是空的但库里已经有别的表，
 * 说明这是一个迁移体系引入之前就存在的库 —— 直接跑迁移会重复建表。
 * 此时拒绝启动，要求先跑 {@code scripts/bootstrap-schema-migrations.sh} 把现有文件标记为已应用。
 */
@Component
@ConditionalOnProperty(name = "app.schema-migrations.enabled", havingValue = "true", matchIfMissing = true)
public class SchemaMigrationRunner {

    private static final Logger log = LoggerFactory.getLogger(SchemaMigrationRunner.class);

    /** 任意常量，只要全库唯一即可。 */
    private static final long ADVISORY_LOCK_ID = 4_820_119_003L;

    private static final String LOCATION = "classpath:db/migrations/*.sql";

    private final DataSource dataSource;
    private final boolean failOnDrift;

    public SchemaMigrationRunner(DataSource dataSource,
                                 @Value("${app.schema-migrations.fail-on-drift:true}") boolean failOnDrift) {
        this.dataSource = dataSource;
        this.failOnDrift = failOnDrift;
        run();
    }

    private void run() {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(true);
            acquireLock(conn);
            try {
                ensureTrackingTable(conn);
                guardPreExistingDatabase(conn);

                Map<String, String> applied = loadApplied(conn);
                List<Resource> files = loadMigrationFiles();

                int count = 0;
                for (Resource file : files) {
                    String name = file.getFilename();
                    String body = readAll(file);
                    String hash = sha256(body);

                    String appliedHash = applied.get(name);
                    if (appliedHash != null) {
                        if (!appliedHash.equals(hash) && failOnDrift) {
                            throw new IllegalStateException(
                                    "Migration drift detected: '" + name + "' was already applied but its "
                                    + "content changed. Revert the edit, or add a NEW migration file. "
                                    + "See CLAUDE.md > 6. Database.");
                        }
                        continue;
                    }

                    log.info("applying migration: {}", name);
                    applyOne(conn, name, body, hash);
                    count++;
                }

                if (count > 0) {
                    log.info("applied {} migration(s), {} total on record", count, applied.size() + count);
                } else {
                    log.info("schema up to date, {} migration(s) on record", applied.size());
                }
            } finally {
                releaseLock(conn);
            }
        } catch (SQLException | IOException e) {
            throw new IllegalStateException("Schema migration failed", e);
        }
    }

    private void acquireLock(Connection conn) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("SELECT pg_advisory_lock(?)")) {
            ps.setLong(1, ADVISORY_LOCK_ID);
            ps.execute();
        }
    }

    private void releaseLock(Connection conn) {
        try (PreparedStatement ps = conn.prepareStatement("SELECT pg_advisory_unlock(?)")) {
            ps.setLong(1, ADVISORY_LOCK_ID);
            ps.execute();
        } catch (SQLException e) {
            log.warn("failed to release advisory lock (it will be released on connection close)");
        }
    }

    private void ensureTrackingTable(Connection conn) throws SQLException {
        try (Statement st = conn.createStatement()) {
            st.execute("""
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        filename     text PRIMARY KEY,
                        content_hash text        NOT NULL,
                        applied_at   timestamptz NOT NULL DEFAULT now(),
                        duration_ms  bigint
                    )""");
        }
    }

    /**
     * 保护：迁移表为空但库里已有<b>真实的表</b> = 这是迁移体系引入之前的库。
     * 直接跑迁移会撞已存在的对象。
     *
     * <p><b>★ 必须过滤 {@code table_type = 'BASE TABLE'}。</b>
     *
     * <p>{@code information_schema.tables} <b>把视图也算进去</b>。而托管数据库
     * 几乎都会往每个新库的 {@code public} schema 里装监控扩展的视图 ——
     * Sealos 的 PostgreSQL 装了 {@code pg_stat_statements} 和 {@code pg_stat_kcache}，
     * 一个刚 {@code CREATE DATABASE} 出来的空库里就已经有 4 个这样的视图。
     *
     * <p>不过滤类型的话，<b>全新的空库会被误判成"迁移体系引入之前的老库"</b>，
     * 应用拒绝启动。而这个误判发生在第一次部署 —— 最没有参照物、
     * 最容易怀疑成别的问题的时候，报错还指向一个需要人工介入的补救流程。
     */
    private void guardPreExistingDatabase(Connection conn) throws SQLException {
        try (Statement st = conn.createStatement()) {
            try (ResultSet rs = st.executeQuery("SELECT count(*) FROM schema_migrations")) {
                rs.next();
                if (rs.getLong(1) > 0) {
                    return;
                }
            }
            try (ResultSet rs = st.executeQuery(
                    "SELECT count(*) FROM information_schema.tables "
                    + "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
                    + "AND table_name <> 'schema_migrations'")) {
                rs.next();
                if (rs.getLong(1) > 0) {
                    throw new IllegalStateException(
                            "schema_migrations is empty but the database already contains "
                            + rs.getLong(1) + " table(s). This looks like a database that predates "
                            + "the migration runner. Applying migrations now would collide with "
                            + "objects that already exist. Either point the app at an empty "
                            + "database, or record the existing migrations as applied without "
                            + "running them: for each file in database/migrations, insert a row "
                            + "into schema_migrations with its filename and the SHA-256 of its "
                            + "exact contents.");
                }
            }
        }
    }

    private Map<String, String> loadApplied(Connection conn) throws SQLException {
        Map<String, String> applied = new HashMap<>();
        try (Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery("SELECT filename, content_hash FROM schema_migrations")) {
            while (rs.next()) {
                applied.put(rs.getString(1), rs.getString(2));
            }
        }
        return applied;
    }

    private List<Resource> loadMigrationFiles() throws IOException {
        Resource[] found = new PathMatchingResourcePatternResolver().getResources(LOCATION);
        List<Resource> files = new ArrayList<>(List.of(found));
        // ★ 字典序即执行顺序。文件名的 YYYY-MM-DD_NN_ 前缀保证顺序确定 ——
        //   这也是 pre-commit 闸门校验文件名的原因。
        files.sort(Comparator.comparing(Resource::getFilename));
        return files;
    }

    private void applyOne(Connection conn, String name, String body, String hash) throws SQLException {
        long start = System.currentTimeMillis();
        conn.setAutoCommit(false);
        try (Statement st = conn.createStatement()) {
            for (String stmt : splitStatements(body)) {
                st.execute(stmt);
            }
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO schema_migrations (filename, content_hash, duration_ms) VALUES (?, ?, ?)")) {
                ps.setString(1, name);
                ps.setString(2, hash);
                ps.setLong(3, System.currentTimeMillis() - start);
                ps.executeUpdate();
            }
            conn.commit();
        } catch (SQLException e) {
            conn.rollback();
            throw new SQLException("Migration '" + name + "' failed: " + e.getMessage(), e);
        } finally {
            conn.setAutoCommit(true);
        }
    }

    /**
     * 按 {@code ;} 切分语句，跳过注释和字符串里的分号。
     *
     * <p><b>不支持 {@code $$} 美元引号</b> —— 这是 pre-commit 闸门禁止在迁移里写
     * {@code DO $$} 块的原因。需要定义函数时，函数体用单引号字符串形式
     * （见 {@code 2026-08-02_04_pricing-quote-order.sql} 的触发器写法）。
     */
    static List<String> splitStatements(String sql) {
        List<String> out = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inSingle = false;
        boolean inLineComment = false;
        boolean inBlockComment = false;

        for (int i = 0; i < sql.length(); i++) {
            char c = sql.charAt(i);
            char next = i + 1 < sql.length() ? sql.charAt(i + 1) : '\0';

            if (inLineComment) {
                if (c == '\n') {
                    inLineComment = false;
                    current.append(c);
                }
                continue;
            }
            if (inBlockComment) {
                if (c == '*' && next == '/') {
                    inBlockComment = false;
                    i++;
                }
                continue;
            }
            if (!inSingle && c == '-' && next == '-') {
                inLineComment = true;
                continue;
            }
            if (!inSingle && c == '/' && next == '*') {
                inBlockComment = true;
                i++;
                continue;
            }
            if (c == '\'') {
                // '' 是转义的单引号，不是字符串结束
                if (inSingle && next == '\'') {
                    current.append(c).append(next);
                    i++;
                    continue;
                }
                inSingle = !inSingle;
            }
            if (c == ';' && !inSingle) {
                addIfNotBlank(out, current);
                current.setLength(0);
                continue;
            }
            current.append(c);
        }
        addIfNotBlank(out, current);
        return out;
    }

    private static void addIfNotBlank(List<String> out, StringBuilder sb) {
        String s = sb.toString().trim();
        if (!s.isEmpty()) {
            out.add(s);
        }
    }

    private static String readAll(Resource r) throws IOException {
        try (var in = r.getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static String sha256(String s) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(64);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
