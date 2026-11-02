package com.mfg.platform.auth;

import com.mfg.platform.identity.ExternalUser;
import com.mfg.platform.identity.ExternalUserRepository;
import com.mfg.platform.identity.Organization;
import com.mfg.platform.identity.OrganizationRepository;
import com.mfg.platform.identity.dto.RegisterRequest;
import com.mfg.common.security.PartyType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 验证码（邮箱）登录 —— 真 Tomcat + 真限流 + 真 PostgreSQL + 真 Redis。
 *
 * <p>码本身不落明文，测试里也不从邮件读：直接往 {@link OtpCodeStore} 里放一条"已知码"，
 * 再走 HTTP 校验。这样测的是对外契约（校验、作废、一次性、限流），而不是随机数的实现。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class OtpLoginFlowIT {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private OrganizationRepository organizations;

    @Autowired
    private ExternalUserRepository externalUsers;

    @Autowired
    private OtpCodeStore store;

    @Autowired
    private StringRedisTemplate redis;

    @BeforeEach
    void resetRedis() {
        // 限流计数和码都在 Redis 里，测试之间必须清 —— 否则上一个用例的计数会漏到下一个
        redis.execute((org.springframework.data.redis.connection.RedisConnection c) -> {
            c.serverCommands().flushDb();
            return null;
        });
    }

    // ---------- 发码 ----------

    @Test
    void sendResponseIsIdenticalForKnownAndUnknownIdentifier() throws Exception {
        String known = newCustomer();
        String unknown = "nobody-" + UUID.randomUUID() + "@example.com";

        ResponseEntity<String> a = rawPost("/auth/otp/send", body("EMAIL", known));
        ResponseEntity<String> b = rawPost("/auth/otp/send", body("EMAIL", unknown));

        assertThat(a.getStatusCode().value()).isEqualTo(200);
        assertThat(b.getStatusCode().value()).isEqualTo(200);
        // 状态码和响应体都必须一样 —— 任何差异都是账号枚举
        assertThat(b.getBody()).isEqualTo(a.getBody());
    }

    @Test
    void sixthSendWithinAnHourIsRateLimited() throws Exception {
        String email = newCustomer();
        for (int i = 0; i < 5; i++) {
            assertThat(rawPost("/auth/otp/send", body("EMAIL", email)).getStatusCode().value())
                    .isEqualTo(200);
        }
        ResponseEntity<String> sixth = rawPost("/auth/otp/send", body("EMAIL", email));
        assertThat(sixth.getStatusCode().value()).isEqualTo(429);
        assertThat(json.readTree(sixth.getBody()).path("message").asText())
                .isEqualTo("auth.otp_rate_limited");
    }

    // ---------- 校验 ----------

    @Test
    void correctCodeLogsInExistingCustomerAndMarksEmailVerified() throws Exception {
        String email = newCustomer();
        plant(email, "123456");

        JsonNode res = post("/auth/otp/verify", verifyBody(email, "123456"));
        JsonNode data = res.path("data");
        assertThat(data.path("registrationRequired").asBoolean()).isFalse();

        JsonNode token = data.path("token");
        assertThat(token.path("portalType").asText()).isEqualTo("CUSTOMER");
        assertThat(token.path("accessToken").asText()).isNotBlank();
        assertThat(token.path("refreshToken").asText()).isNotBlank();

        ExternalUser user = externalUsers.findByEmail(email).orElseThrow();
        assertThat(user.getEmailVerifiedAt()).isNotNull();
    }

    @Test
    void unknownEmailStopsAtRegistrationAndIssuesNoToken() throws Exception {
        String email = "fresh-" + UUID.randomUUID() + "@example.com";
        plant(email, "654321");

        ResponseEntity<String> res = rawPost("/auth/otp/verify", verifyBody(email, "654321"));
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
        JsonNode data = json.readTree(res.getBody()).path("data");
        assertThat(data.path("registrationRequired").asBoolean()).as(res.getBody()).isTrue();
        // 不建号、不发 token —— 建号那一步（填公司信息）还没做
        // token 为 null 时序列化会整个省略这个字段，所以判"没有非空 token"而不是 isNull()
        assertThat(data.hasNonNull("token")).isFalse();
        assertThat(externalUsers.findByEmail(email)).isEmpty();
    }

    @Test
    void fiveWrongCodesInvalidateTheCode() throws Exception {
        String email = newCustomer();
        plant(email, "111111");

        for (int i = 0; i < 5; i++) {
            ResponseEntity<String> res = rawPost("/auth/otp/verify", verifyBody(email, "000000"));
            assertThat(res.getStatusCode().value()).isEqualTo(400);
            assertThat(json.readTree(res.getBody()).path("message").asText())
                    .isEqualTo("auth.otp_code_incorrect");
        }

        // 第 5 次之后码已作废，正确的码也不认
        ResponseEntity<String> after = rawPost("/auth/otp/verify", verifyBody(email, "111111"));
        assertThat(after.getStatusCode().value()).isEqualTo(400);
        assertThat(json.readTree(after.getBody()).path("message").asText())
                .isEqualTo("auth.otp_expired");
    }

    @Test
    void codeCanBeUsedOnlyOnce() throws Exception {
        String email = newCustomer();
        plant(email, "222222");

        assertThat(rawPost("/auth/otp/verify", verifyBody(email, "222222")).getStatusCode().value())
                .isEqualTo(200);
        ResponseEntity<String> second = rawPost("/auth/otp/verify", verifyBody(email, "222222"));
        assertThat(second.getStatusCode().value()).isEqualTo(400);
        assertThat(json.readTree(second.getBody()).path("message").asText())
                .isEqualTo("auth.otp_expired");
    }

    @Test
    void smsChannelIsRejectedInsteadOfSilentlySucceeding() throws Exception {
        ResponseEntity<String> res = rawPost("/auth/otp/send",
                new AuthOtpController.SendRequest(OtpChannel.SMS, "+4915112345678"));
        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(json.readTree(res.getBody()).path("message").asText())
                .isEqualTo("auth.otp_channel_unavailable");
    }

    // ---------- helpers ----------

    private String newCustomer() throws Exception {
        String email = "otp-" + UUID.randomUUID() + "@example.com";
        post("/auth/register",
                new RegisterRequest(PartyType.CUSTOMER, "OTP GmbH", "DE", email, "password123", "Olga"), null);
        return email;
    }

    /** 放进一条已知码，模拟"用户收到了 123456"。哈希算法与生产代码同源。 */
    private void plant(String email, String code) {
        String identifierHash = OtpService.sha256(email.trim().toLowerCase());
        store.put(OtpChannel.EMAIL, identifierHash,
                OtpService.hashCode(identifierHash, code), OtpService.CODE_TTL_SECONDS);
    }

    private AuthOtpController.SendRequest body(String channel, String identifier) {
        return new AuthOtpController.SendRequest(OtpChannel.valueOf(channel), identifier);
    }

    private AuthOtpController.VerifyRequest verifyBody(String email, String code) {
        return new AuthOtpController.VerifyRequest(OtpChannel.EMAIL, email, code);
    }

    private JsonNode post(String path, Object body) throws Exception {
        return json.readTree(rawPost(path, body).getBody());
    }

    private JsonNode post(String path, Object body, String bearer) throws Exception {
        return json.readTree(rawPost(path, body, bearer).getBody());
    }

    private ResponseEntity<String> rawPost(String path, Object body) {
        return rawPost(path, body, null);
    }

    private ResponseEntity<String> rawPost(String path, Object body, String bearer) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) {
            headers.setBearerAuth(bearer);
        }
        return rest.postForEntity(url(path), new HttpEntity<>(body, headers), String.class);
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }
}
