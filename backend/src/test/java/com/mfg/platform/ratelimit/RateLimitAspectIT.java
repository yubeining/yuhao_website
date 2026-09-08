package com.mfg.platform.ratelimit;

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
 * {@link RateLimit} 切面对着真 Redis 的验证：窗口内到达上限即拒（429），不同 subject 各自计数，
 * {@code ${...}} 占位符能从配置解析出阈值。
 */
class RateLimitAspectIT extends AbstractIntegrationTest {

    /** 被 @RateLimit 保护的测试 bean（必须是 Spring bean，切面才会代理它）。 */
    static class Guarded {
        private final AtomicInteger calls = new AtomicInteger();

        // 同一 subject 窗口内最多 2 次
        @RateLimit(scope = "test-fixed", key = "#who", limit = "2", windowSeconds = "60")
        public String run(String who) {
            calls.incrementAndGet();
            return "ok:" + who;
        }

        // 阈值走配置占位符（application.yml 里 app.auth.login.max-attempts 默认 10）
        @RateLimit(scope = "test-configured", key = "#who",
                limit = "${app.auth.login.max-attempts}", windowSeconds = "60")
        public String runConfigured(String who) {
            calls.incrementAndGet();
            return "ok:" + who;
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
    void overLimitIsRejectedPerSubject() {
        assertThat(guarded.run("alice")).isEqualTo("ok:alice");
        assertThat(guarded.run("alice")).isEqualTo("ok:alice");

        // 第 3 次超限 → 429，且没进方法
        assertThatThrownBy(() -> guarded.run("alice"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(429));

        // 另一个 subject 独立计数，不受影响
        assertThat(guarded.run("bob")).isEqualTo("ok:bob");
        assertThat(guarded.getCalls()).isEqualTo(3);  // alice 两次 + bob 一次；被拒的那次没进方法
    }

    @Test
    void placeholderLimitResolvesFromConfig() {
        // 默认阈值 10，第 10 次仍放行，说明占位符被解析成了数字（而非当字面量拒掉）
        for (int i = 0; i < 10; i++) {
            assertThat(guarded.runConfigured("carol")).isEqualTo("ok:carol");
        }
        assertThatThrownBy(() -> guarded.runConfigured("carol"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(429));
    }
}
