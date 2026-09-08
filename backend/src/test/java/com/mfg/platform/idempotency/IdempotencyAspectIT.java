package com.mfg.platform.idempotency;

import com.mfg.common.exception.BusinessException;
import com.mfg.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@link Idempotent} 切面对着真 Redis 的验证：同 key 重复被拒、异 key 放行、失败可重试。
 */
class IdempotencyAspectIT extends AbstractIntegrationTest {

    /** 被 @Idempotent 保护的测试 bean（必须是 Spring bean，切面才会代理它）。 */
    static class Guarded {
        private final AtomicInteger calls = new AtomicInteger();

        @Idempotent(key = "#id", ttlSeconds = 60)
        public String run(String id) {
            calls.incrementAndGet();
            return "ok:" + id;
        }

        @Idempotent(key = "#id", ttlSeconds = 60)
        public String runFailing(String id) {
            calls.incrementAndGet();
            throw new IllegalStateException("boom");
        }

        int getCalls() {
            return calls.get();
        }

        void reset() {
            calls.set(0);
        }
    }

    @TestConfiguration
    static class Config {
        @Bean
        Guarded guarded() {
            return new Guarded();
        }
    }

    @Autowired
    private Guarded guarded;

    @org.junit.jupiter.api.BeforeEach
    void resetCounter() {
        guarded.reset();
    }

    @Test
    void duplicateSameKeyIsRejected() {
        assertThat(guarded.run("a")).isEqualTo("ok:a");

        assertThatThrownBy(() -> guarded.run("a"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(409));

        // 不同 key 不受影响
        assertThat(guarded.run("b")).isEqualTo("ok:b");
        assertThat(guarded.getCalls()).isEqualTo(2);  // a 一次 + b 一次；重复的 a 没进方法
    }

    @Test
    void failedCallReleasesLockSoItCanRetry() {
        assertThatThrownBy(() -> guarded.runFailing("x")).isInstanceOf(IllegalStateException.class);
        // 上一次抛了异常 → 锁释放 → 同 key 可再试（又抛，但说明进了方法，不是 409）
        assertThatThrownBy(() -> guarded.runFailing("x")).isInstanceOf(IllegalStateException.class);
        assertThat(guarded.getCalls()).isEqualTo(2);
    }
}
