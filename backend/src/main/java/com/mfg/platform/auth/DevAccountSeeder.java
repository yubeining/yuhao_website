package com.mfg.platform.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.mfg.config.AppProperties;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * 开发用种子账号 —— 三个端各一个测试账号，让登录能立刻试。
 *
 * <p><b>只在 {@code app.auth.dev-seed.enabled=true} 时启用（默认 false）。</b>
 * 生产环境永远关着；生产的运营管理员另配（真实注册 / 邀请做好之后走正规路径）。
 *
 * <p>幂等：按邮箱判存在，已存在就跳过 —— 反复重启不会重复建、也不会覆盖你改过的密码。
 * 用 JdbcTemplate 直插（不经实体），因为 party 等表本轮没有写实体，且这是纯开发工具。
 */
@Component
@ConditionalOnProperty(name = "app.auth.dev-seed.enabled", havingValue = "true")
public class DevAccountSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DevAccountSeeder.class);

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;
    private final String password;

    public DevAccountSeeder(JdbcTemplate jdbc, PasswordEncoder passwordEncoder, AppProperties props) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
        this.password = props.auth().devSeed().password();
    }

    @Override
    public void run(ApplicationArguments args) {
        String hash = passwordEncoder.encode(password);
        int created = 0;
        created += seedOps("ops@mfg.local", "Dev Ops", hash);
        created += seedExternal("CUSTOMER", "C-DEV", "Dev Customer Co", "customer@mfg.local", "Dev Customer", hash);
        created += seedExternal("SUPPLIER", "S-DEV", "Dev Supplier Co", "supplier@mfg.local", "Dev Supplier", hash);

        log.warn("========================================================================");
        log.warn("DEV SEED is ON. {} test account(s) ensured. Password for all: '{}'", created, password);
        log.warn("  ops@mfg.local (portalType=OPERATOR) / customer@mfg.local (CUSTOMER) / supplier@mfg.local (SUPPLIER)");
        log.warn("  This must be OFF in production (app.auth.dev-seed.enabled=false).");
        log.warn("========================================================================");
    }

    private int seedOps(String email, String displayName, String passwordHash) {
        Long exists = jdbc.queryForObject(
                "SELECT count(*) FROM ops_user WHERE lower(email) = lower(?)", Long.class, email);
        if (exists != null && exists > 0) {
            return 0;
        }
        jdbc.update("INSERT INTO ops_user (id, email, display_name, password_hash, status) "
                        + "VALUES (?, ?, ?, ?, 'ACTIVE')",
                UUID.randomUUID(), email, displayName, passwordHash);
        return 1;
    }

    private int seedExternal(String type, String code, String companyName,
                             String email, String displayName, String passwordHash) {
        Long exists = jdbc.queryForObject(
                "SELECT count(*) FROM party_user WHERE lower(email) = lower(?)", Long.class, email);
        if (exists != null && exists > 0) {
            return 0;
        }
        UUID partyId = UUID.randomUUID();
        jdbc.update("INSERT INTO party (id, type, code, name, status) VALUES (?, ?, ?, ?, 'ACTIVE')",
                partyId, type, code, companyName);
        jdbc.update("INSERT INTO party_user (id, party_id, email, display_name, role, password_hash, "
                        + "status, locale) VALUES (?, ?, ?, ?, 'ADMIN', ?, 'ACTIVE', 'en')",
                UUID.randomUUID(), partyId, email, displayName, passwordHash);
        return 1;
    }
}
