package com.mfg.platform.auth;

import com.mfg.common.security.PartyType;
import com.mfg.platform.identity.dto.RegisterRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 忘记密码的限流 —— 和登录验证码同一套阈值（本人 2026-11-23 拍板「照登录验证码」）。
 *
 * <p>★ 钉的是一个暴力破解路径：以前发新码会把试错次数清零、且申请不限次，
 * 攻击者循环「申请 → 猜 5 次」就能无限猜下去（每轮 5/1,000,000）。
 * 限住「同一邮箱每小时发几次码」，每小时能猜的次数就有了上限。
 *
 * <p>阈值压小，让断言快且确定；三个阈值互不相同，免得一个桶的 429 被误当成另一个桶的。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "app.auth.otp.identifier-limit=2",
        "app.auth.otp.ip-limit=4",
        "app.auth.otp.verify-ip-limit=3"
})
class PasswordResetRateLimitIT {

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private StringRedisTemplate redis;

    @BeforeEach
    void resetRedis() {
        redis.execute((org.springframework.data.redis.connection.RedisConnection c) -> {
            c.serverCommands().flushDb();
            return null;
        });
    }

    @Test
    void sameEmailCanRequestOnlyIdentifierLimitCodesPerHour() {
        String known = newCustomer();

        assertThat(forgot(known).getStatusCode().value()).isEqualTo(200);
        assertThat(forgot(known).getStatusCode().value()).isEqualTo(200);
        // 大小写 / 空格变体落在同一个桶
        assertThat(forgot("  " + known.toUpperCase() + " ").getStatusCode().value()).isEqualTo(429);
    }

    @Test
    void unknownEmailIsLimitedTheSameWaySoTheLimitRevealsNothing() {
        String unknown = "nobody-" + UUID.randomUUID() + "@example.com";

        assertThat(forgot(unknown).getStatusCode().value()).isEqualTo(200);
        assertThat(forgot(unknown).getStatusCode().value()).isEqualTo(200);
        assertThat(forgot(unknown).getStatusCode().value()).isEqualTo(429);
    }

    @Test
    void sameIpCanRequestOnlyIpLimitCodesPerHour() {
        for (int i = 0; i < 4; i++) {
            assertThat(forgot("ip-" + UUID.randomUUID() + "@example.com").getStatusCode().value()).isEqualTo(200);
        }
        assertThat(forgot("ip-" + UUID.randomUUID() + "@example.com").getStatusCode().value()).isEqualTo(429);
    }

    @Test
    void sameIpCanTryResetOnlyVerifyIpLimitTimesPerHour() {
        for (int i = 0; i < 3; i++) {
            String email = "rs-" + UUID.randomUUID() + "@example.com";
            assertThat(reset(email).getStatusCode().value()).isEqualTo(400);
        }
        assertThat(reset("rs-" + UUID.randomUUID() + "@example.com").getStatusCode().value()).isEqualTo(429);
    }

    // ---------- helpers ----------

    private String newCustomer() {
        String email = "rl-" + UUID.randomUUID() + "@example.com";
        ResponseEntity<String> r = post("/auth/register",
                new RegisterRequest(PartyType.CUSTOMER, "Rl GmbH", "DE", email, "password123", "Rita"));
        assertThat(r.getStatusCode().is2xxSuccessful()).isTrue();
        return email;
    }

    private ResponseEntity<String> forgot(String email) {
        return post("/auth/password/forgot", new PasswordResetController.ForgotRequest(email));
    }

    private ResponseEntity<String> reset(String email) {
        return post("/auth/password/reset",
                new PasswordResetController.ResetRequest(email, "123456", "new-password-456"));
    }

    private ResponseEntity<String> post(String path, Object body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return rest.postForEntity(path, new HttpEntity<>(body, headers), String.class);
    }
}
