package com.mfg.common.service;

import com.mfg.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Duration;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * 限流器对着<b>真实 Redis</b> 的测试（§9：*IT 不 mock 缓存）。
 * 每个用例用唯一 subject 隔离，不依赖清库、也不互相串味。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
class RateLimiterIT {

    private static final Duration WINDOW = Duration.ofSeconds(60);

    @Autowired
    private RateLimiter rateLimiter;

    @Test
    void allowsUpToLimitThenRejects() {
        String subject = UUID.randomUUID().toString();

        // 限额 3：前 3 次放行，第 4 次拒
        assertThat(rateLimiter.tryAcquire("test", subject, 3, WINDOW)).isTrue();
        assertThat(rateLimiter.tryAcquire("test", subject, 3, WINDOW)).isTrue();
        assertThat(rateLimiter.tryAcquire("test", subject, 3, WINDOW)).isTrue();
        assertThat(rateLimiter.tryAcquire("test", subject, 3, WINDOW)).isFalse();
        assertThat(rateLimiter.tryAcquire("test", subject, 3, WINDOW)).isFalse();
    }

    @Test
    void differentSubjectsAreIndependent() {
        String a = UUID.randomUUID().toString();
        String b = UUID.randomUUID().toString();

        assertThat(rateLimiter.tryAcquire("test", a, 1, WINDOW)).isTrue();
        assertThat(rateLimiter.tryAcquire("test", a, 1, WINDOW)).isFalse();  // a 用完
        assertThat(rateLimiter.tryAcquire("test", b, 1, WINDOW)).isTrue();   // b 不受影响
    }

    @Test
    void enforceThrows429WhenExceeded() {
        String subject = UUID.randomUUID().toString();

        assertThatCode(() -> rateLimiter.enforce("test", subject, 2, WINDOW)).doesNotThrowAnyException();
        assertThatCode(() -> rateLimiter.enforce("test", subject, 2, WINDOW)).doesNotThrowAnyException();

        assertThatThrownBy(() -> rateLimiter.enforce("test", subject, 2, WINDOW))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> {
                    BusinessException be = (BusinessException) e;
                    assertThat(be.getCode()).isEqualTo(429);
                    assertThat(be.getMessageCode()).isEqualTo("common.rate_limited");
                });
    }
}
