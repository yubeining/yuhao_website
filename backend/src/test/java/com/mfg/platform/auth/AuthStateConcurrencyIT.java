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
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 认证状态的并发 —— 真 Tomcat + 真 Redis，同一时刻打 N 个请求。
 *
 * <p>★ 钉两个「先查后改」的竞态（2026-11-23 全项目 review）：
 * <ul>
 *   <li>refresh token 先 GET 再 DELETE：同一个 token 并发刷新，每个请求都读到它还在，都换到新 token。</li>
 *   <li>验证码先读试错次数再比对：N 个并发猜测都读到「还没错满」，「错 5 次作废」挡不住。</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class AuthStateConcurrencyIT {

    private static final int THREADS = 20;

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private OtpCodeStore otpStore;

    @Autowired
    private PasswordCodeStore passwordStore;

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
    void sameRefreshTokenUsedConcurrentlyRotatesOnlyOnce() throws Exception {
        String email = newCustomer();
        String refresh = json.readTree(post("/auth/login",
                        new ExternalAuthController.ExternalLoginRequest(email, "password123")).getBody())
                .path("data").path("refreshToken").asText();
        assertThat(refresh).isNotBlank();

        List<ResponseEntity<String>> results = concurrently(() -> post("/auth/refresh", new RefreshRequest(refresh)));

        assertThat(results.stream().filter(r -> r.getStatusCode().value() == 200).count()).isEqualTo(1);
    }

    @Test
    void concurrentWrongLoginCodesCannotExceedTheAttemptCap() throws Exception {
        String email = "race-" + UUID.randomUUID() + "@example.com";
        String identifierHash = OtpService.sha256(email);
        otpStore.put(OtpChannel.EMAIL, identifierHash,
                OtpService.hashCode(identifierHash, "111111"), OtpService.CODE_TTL_SECONDS);

        List<ResponseEntity<String>> results = concurrently(() -> post("/auth/otp/verify",
                new AuthOtpController.VerifyRequest(OtpChannel.EMAIL, email, "000000")));

        assertThat(countIncorrect(results)).isLessThanOrEqualTo(OtpService.MAX_ATTEMPTS);
    }

    @Test
    void concurrentWrongResetCodesCannotExceedTheAttemptCap() throws Exception {
        String email = newCustomer();
        String subject = PasswordService.resetSubject(email);
        passwordStore.put(PasswordCodeStore.Purpose.RESET, subject,
                OtpService.hashCode(subject, "111111"), PasswordService.CODE_TTL_SECONDS);

        List<ResponseEntity<String>> results = concurrently(() -> post("/auth/password/reset",
                new PasswordResetController.ResetRequest(email, "000000", "new-password-456")));

        assertThat(countIncorrect(results)).isLessThanOrEqualTo(PasswordService.MAX_ATTEMPTS);
    }

    // ---------- helpers ----------

    private static long countIncorrect(List<ResponseEntity<String>> results) {
        return results.stream()
                .filter(r -> r.getBody() != null && r.getBody().contains("auth.otp_code_incorrect"))
                .count();
    }

    /** 让 {@value #THREADS} 个线程在同一个闸门后面一起放出去。 */
    private static List<ResponseEntity<String>> concurrently(Supplier<ResponseEntity<String>> call) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        try {
            CountDownLatch gate = new CountDownLatch(1);
            List<Future<ResponseEntity<String>>> futures = new ArrayList<>();
            for (int i = 0; i < THREADS; i++) {
                futures.add(pool.submit(() -> {
                    gate.await();
                    return call.get();
                }));
            }
            gate.countDown();
            List<ResponseEntity<String>> out = new ArrayList<>();
            for (Future<ResponseEntity<String>> f : futures) {
                out.add(f.get());
            }
            return out;
        } finally {
            pool.shutdownNow();
        }
    }

    private String newCustomer() {
        String email = "race-" + UUID.randomUUID() + "@example.com";
        ResponseEntity<String> r = post("/auth/register",
                new RegisterRequest(PartyType.CUSTOMER, "Race GmbH", "DE", email, "password123", "Rae"));
        assertThat(r.getStatusCode().is2xxSuccessful()).isTrue();
        return email;
    }

    private ResponseEntity<String> post(String path, Object body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return rest.postForEntity(path, new HttpEntity<>(body, headers), String.class);
    }
}
