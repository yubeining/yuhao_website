package com.mfg.platform.auth;

import com.mfg.common.security.PartyType;
import com.mfg.platform.identity.ExternalUser;
import com.mfg.platform.identity.ExternalUserRepository;
import com.mfg.platform.identity.OpsUser;
import com.mfg.platform.identity.OpsUserRepository;
import com.mfg.platform.identity.Organization;
import com.mfg.platform.identity.OrganizationRepository;
import com.mfg.platform.identity.dto.RegisterRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 忘记密码（客户 / 供应商）与已登录改密码（三端）—— 真 Tomcat + 真 PostgreSQL + 真 Redis。
 *
 * <p>码不从邮件读：直接往 {@link PasswordCodeStore} 里放一条"已知码"再走 HTTP，
 * 测的是对外契约（防枚举、一次性、错次作废、吊销会话、受众闸门），不是随机数。
 *
 * <p>规则出处：需求方 2026-11-23 三轮回复，见 changelog/2026-11-23_password-reset。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class PasswordFlowIT {

    private static final String OLD = "password123";
    private static final String NEW = "new-password-456";

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
    private OpsUserRepository opsUsers;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private PasswordCodeStore store;

    @Autowired
    private OtpCodeStore otpStore;

    @Autowired
    private StringRedisTemplate redis;

    @BeforeEach
    void resetRedis() {
        redis.execute((org.springframework.data.redis.connection.RedisConnection c) -> {
            c.serverCommands().flushDb();
            return null;
        });
    }

    // ---------- 忘记密码：申请 ----------

    @Test
    void forgotResponseIsIdenticalWhetherOrNotTheAccountExists() {
        String known = newCustomer();
        String disabled = newCustomer();
        ExternalUser d = externalUsers.findByEmail(disabled).orElseThrow();
        d.setStatus(ExternalUser.Status.DISABLED);
        externalUsers.save(d);
        String ops = newOps();
        String unknown = "nobody-" + UUID.randomUUID() + "@example.com";

        ResponseEntity<String> a = post("/auth/password/forgot", new PasswordResetController.ForgotRequest(known), null);
        ResponseEntity<String> b = post("/auth/password/forgot", new PasswordResetController.ForgotRequest(unknown), null);
        ResponseEntity<String> c = post("/auth/password/forgot", new PasswordResetController.ForgotRequest(disabled), null);
        ResponseEntity<String> o = post("/auth/password/forgot", new PasswordResetController.ForgotRequest(ops), null);

        assertThat(a.getStatusCode().value()).isEqualTo(200);
        assertThat(b.getStatusCode().value()).isEqualTo(200);
        assertThat(b.getBody()).isEqualTo(a.getBody());
        assertThat(c.getBody()).isEqualTo(a.getBody());
        assertThat(o.getBody()).isEqualTo(a.getBody());

        // 只有可用的外部账号真的生成了码
        assertThat(store.codeHash(PasswordCodeStore.Purpose.RESET, PasswordService.resetSubject(known))).isNotNull();
        assertThat(store.codeHash(PasswordCodeStore.Purpose.RESET, PasswordService.resetSubject(unknown))).isNull();
        assertThat(store.codeHash(PasswordCodeStore.Purpose.RESET, PasswordService.resetSubject(disabled))).isNull();
        assertThat(store.codeHash(PasswordCodeStore.Purpose.RESET, PasswordService.resetSubject(ops))).isNull();
    }

    @Test
    void newRequestInvalidatesThePreviousCode() throws Exception {
        String email = newCustomer();
        plantReset(email, "123456");

        post("/auth/password/forgot", new PasswordResetController.ForgotRequest(email), null);

        ResponseEntity<String> res = reset(email, "123456", NEW);
        assertThat(res.getStatusCode().value()).isEqualTo(400);
    }

    // ---------- 忘记密码：重置 ----------

    @Test
    void correctCodeResetsPasswordAndLogsIn() throws Exception {
        String email = newCustomer();
        plantReset(email, "123456");

        ResponseEntity<String> res = reset(email, "123456", NEW);
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
        JsonNode data = json.readTree(res.getBody()).path("data");
        assertThat(data.path("portalType").asText()).isEqualTo("CUSTOMER");
        assertThat(data.path("accessToken").asText()).isNotBlank();
        assertThat(data.path("refreshToken").asText()).isNotBlank();

        assertThat(login(email, OLD).getStatusCode().value()).isEqualTo(401);
        assertThat(login(email, NEW).getStatusCode().value()).isEqualTo(200);
        assertThat(externalUsers.findByEmail(email).orElseThrow().getEmailVerifiedAt()).isNotNull();
    }

    @Test
    void resetSignsOutEveryExistingSession() throws Exception {
        String email = newCustomer();
        String refreshA = json.readTree(login(email, OLD).getBody()).path("data").path("refreshToken").asText();
        String refreshB = json.readTree(login(email, OLD).getBody()).path("data").path("refreshToken").asText();
        plantReset(email, "123456");

        JsonNode data = json.readTree(reset(email, "123456", NEW).getBody()).path("data");

        assertThat(refresh(refreshA).getStatusCode().value()).isEqualTo(401);
        assertThat(refresh(refreshB).getStatusCode().value()).isEqualTo(401);
        // 重置后签发的新会话可用
        assertThat(refresh(data.path("refreshToken").asText()).getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void resetDoesNotTouchOtherUsersSessions() throws Exception {
        String victim = newCustomer();
        String other = newCustomer();
        String otherRefresh = json.readTree(login(other, OLD).getBody()).path("data").path("refreshToken").asText();
        plantReset(victim, "123456");

        reset(victim, "123456", NEW);

        assertThat(refresh(otherRefresh).getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void codeCanBeUsedOnlyOnce() throws Exception {
        String email = newCustomer();
        plantReset(email, "123456");

        assertThat(reset(email, "123456", NEW).getStatusCode().value()).isEqualTo(200);
        ResponseEntity<String> second = reset(email, "123456", "another-pass-789");
        assertThat(second.getStatusCode().value()).isEqualTo(400);
        assertThat(message(second)).isEqualTo("auth.otp_expired");
    }

    @Test
    void fiveWrongCodesInvalidateTheCode() throws Exception {
        String email = newCustomer();
        plantReset(email, "111111");

        for (int i = 0; i < 5; i++) {
            ResponseEntity<String> res = reset(email, "000000", NEW);
            assertThat(res.getStatusCode().value()).isEqualTo(400);
            assertThat(message(res)).isEqualTo("auth.otp_code_incorrect");
        }
        ResponseEntity<String> after = reset(email, "111111", NEW);
        assertThat(message(after)).isEqualTo("auth.otp_expired");
    }

    @Test
    void sameAsCurrentPasswordIsRejectedAndCodeStaysUsable() throws Exception {
        String email = newCustomer();
        plantReset(email, "123456");

        ResponseEntity<String> same = reset(email, "123456", OLD);
        assertThat(same.getStatusCode().value()).isEqualTo(400);
        assertThat(message(same)).isEqualTo("auth.password_same_as_current");

        // 新密码不合规不该把码吃掉 —— 否则用户只能重新收一次邮件
        assertThat(reset(email, "123456", NEW).getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void tooShortPasswordIsRejected() throws Exception {
        String email = newCustomer();
        plantReset(email, "123456");

        ResponseEntity<String> res = reset(email, "123456", "short");
        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(message(res)).isEqualTo("auth.password_invalid");
    }

    @Test
    void accountWithoutPasswordCanSetOneThroughReset() throws Exception {
        Organization org = organizations.save(new Organization(Organization.Type.CUSTOMER, "Code Only GmbH", "DE"));
        String email = "nopw-" + UUID.randomUUID() + "@example.com";
        externalUsers.save(new ExternalUser(org.getId(), email, "Nora", null));
        plantReset(email, "123456");

        assertThat(reset(email, "123456", NEW).getStatusCode().value()).isEqualTo(200);
        assertThat(login(email, NEW).getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void loginCodeCannotBeUsedToResetPassword() throws Exception {
        String email = newCustomer();
        String identifierHash = OtpService.sha256(email);
        otpStore.put(OtpChannel.EMAIL, identifierHash,
                OtpService.hashCode(identifierHash, "123456"), OtpService.CODE_TTL_SECONDS);

        ResponseEntity<String> res = reset(email, "123456", NEW);
        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(message(res)).isEqualTo("auth.otp_expired");
    }

    // ---------- 已登录改密码 ----------

    @Test
    void customerChangesPasswordWithEmailCodeAndAllSessionsEnd() throws Exception {
        String email = newCustomer();
        JsonNode session = json.readTree(login(email, OLD).getBody()).path("data");
        String access = session.path("accessToken").asText();
        UUID userId = externalUsers.findByEmail(email).orElseThrow().getId();

        assertThat(post("/customer/me/password/code", null, access).getStatusCode().value()).isEqualTo(200);
        assertThat(store.codeHash(PasswordCodeStore.Purpose.CHANGE,
                PasswordService.changeSubject(PartyType.CUSTOMER, userId))).isNotNull();

        plantChange(PartyType.CUSTOMER, userId, "654321");
        ResponseEntity<String> res = put("/customer/me/password",
                new MePasswordController.ChangeRequest("654321", NEW), access);
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);

        // 含当前设备，全部要重新登录（需求方 2026-11-23）
        assertThat(refresh(session.path("refreshToken").asText()).getStatusCode().value()).isEqualTo(401);
        assertThat(login(email, NEW).getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void opsChangesPasswordWithEmailCode() throws Exception {
        String email = newOps();
        JsonNode session = json.readTree(post("/auth/internal/login",
                new OpsAuthController.OpsLoginRequest(email, OLD), null).getBody()).path("data");
        UUID userId = opsUsers.findByEmail(email).orElseThrow().getId();

        plantChange(PartyType.OPERATOR, userId, "654321");
        ResponseEntity<String> res = put("/ops/me/password",
                new MePasswordController.ChangeRequest("654321", NEW), session.path("accessToken").asText());
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);

        assertThat(post("/auth/internal/refresh", new RefreshRequest(session.path("refreshToken").asText()), null)
                .getStatusCode().value()).isEqualTo(401);
        assertThat(post("/auth/internal/login", new OpsAuthController.OpsLoginRequest(email, NEW), null)
                .getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void changeWithWrongCodeKeepsOldPassword() throws Exception {
        String email = newCustomer();
        String access = json.readTree(login(email, OLD).getBody()).path("data").path("accessToken").asText();
        UUID userId = externalUsers.findByEmail(email).orElseThrow().getId();
        plantChange(PartyType.CUSTOMER, userId, "654321");

        ResponseEntity<String> res = put("/customer/me/password",
                new MePasswordController.ChangeRequest("000000", NEW), access);
        assertThat(message(res)).isEqualTo("auth.otp_code_incorrect");
        assertThat(login(email, OLD).getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void customerTokenCannotUseOpsPath() {
        String email = newCustomer();
        String access = accessOf(email);

        assertThat(post("/ops/me/password/code", null, access).getStatusCode().value()).isEqualTo(403);
        assertThat(put("/ops/me/password", new MePasswordController.ChangeRequest("123456", NEW), access)
                .getStatusCode().value()).isEqualTo(403);
    }

    @Test
    void anonymousCannotChangePassword() {
        assertThat(post("/customer/me/password/code", null, null).getStatusCode().value()).isEqualTo(401);
        assertThat(put("/customer/me/password", new MePasswordController.ChangeRequest("123456", NEW), null)
                .getStatusCode().value()).isEqualTo(401);
    }

    // ---------- helpers ----------

    private String newCustomer() {
        String email = "pw-" + UUID.randomUUID() + "@example.com";
        post("/auth/register",
                new RegisterRequest(PartyType.CUSTOMER, "Pw GmbH", "DE", email, OLD, "Paula"), null);
        return email;
    }

    private String newOps() {
        Organization internal = organizations.save(new Organization(Organization.Type.INTERNAL, "HQ", null));
        String email = "ops-" + UUID.randomUUID() + "@example.com";
        opsUsers.save(new OpsUser(internal.getId(), email, "Otto", passwordEncoder.encode(OLD)));
        return email;
    }

    private void plantReset(String email, String code) {
        String subject = PasswordService.resetSubject(email);
        store.put(PasswordCodeStore.Purpose.RESET, subject,
                OtpService.hashCode(subject, code), PasswordService.CODE_TTL_SECONDS);
    }

    private void plantChange(PartyType portal, UUID userId, String code) {
        String subject = PasswordService.changeSubject(portal, userId);
        store.put(PasswordCodeStore.Purpose.CHANGE, subject,
                OtpService.hashCode(subject, code), PasswordService.CODE_TTL_SECONDS);
    }

    private ResponseEntity<String> reset(String email, String code, String password) {
        return post("/auth/password/reset", new PasswordResetController.ResetRequest(email, code, password), null);
    }

    private ResponseEntity<String> login(String email, String password) {
        return post("/auth/login", new ExternalAuthController.ExternalLoginRequest(email, password), null);
    }

    private ResponseEntity<String> refresh(String refreshToken) {
        return post("/auth/refresh", new RefreshRequest(refreshToken), null);
    }

    private String accessOf(String email) {
        try {
            return json.readTree(login(email, OLD).getBody()).path("data").path("accessToken").asText();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private String message(ResponseEntity<String> res) throws Exception {
        return json.readTree(res.getBody()).path("message").asText();
    }

    private ResponseEntity<String> post(String path, Object body, String bearer) {
        return rest.postForEntity(url(path), new HttpEntity<>(body, headers(bearer)), String.class);
    }

    private ResponseEntity<String> put(String path, Object body, String bearer) {
        return rest.exchange(url(path), HttpMethod.PUT, new HttpEntity<>(body, headers(bearer)), String.class);
    }

    private static HttpHeaders headers(String bearer) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) {
            headers.setBearerAuth(bearer);
        }
        return headers;
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }
}
