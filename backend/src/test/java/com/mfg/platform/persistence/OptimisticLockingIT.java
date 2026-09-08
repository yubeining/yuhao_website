package com.mfg.platform.persistence;

import com.mfg.platform.auth.OpsUser;
import com.mfg.platform.auth.OpsUserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 乐观锁（BaseEntity 的 @Version）真的拦得住并发丢更新 —— 用真库验。
 *
 * <p>用 OpsUser（继承 BaseEntity）当样本。手法：拿到一个受管实体后，用裸 SQL 在它背后
 * 把行的 version +1（模拟"别人抢先改了"），再保存这个已经过期的实体 —— Hibernate 的
 * {@code UPDATE ... WHERE id=? AND version=旧值} 影响 0 行，抛乐观锁异常。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
class OptimisticLockingIT {

    @Autowired
    private OpsUserRepository opsUsers;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void staleUpdateIsRejected() {
        OpsUser saved = opsUsers.saveAndFlush(
                new OpsUser("lock-" + UUID.randomUUID() + "@x.com", null, "V0", "hash"));
        UUID id = saved.getId();
        assertThat(saved.getVersion()).isZero();

        // 别人抢先改了这一行（version 0 -> 1），我们手里的 saved 还以为是 0
        jdbc.update("UPDATE ops_user SET version = version + 1, display_name = 'other' WHERE id = ?", id);

        saved.setDisplayName("mine");
        assertThatThrownBy(() -> opsUsers.saveAndFlush(saved))
                .isInstanceOf(OptimisticLockingFailureException.class);
    }

    @Test
    void normalUpdateBumpsVersion() {
        OpsUser saved = opsUsers.saveAndFlush(
                new OpsUser("bump-" + UUID.randomUUID() + "@x.com", null, "V0", "hash"));

        saved.setDisplayName("V1");
        OpsUser updated = opsUsers.saveAndFlush(saved);

        assertThat(updated.getVersion()).isEqualTo(1L);
    }
}
