package com.mfg.platform.identity;

import com.mfg.common.security.PartyType;
import com.mfg.platform.auth.ExternalAuthController;
import com.mfg.platform.auth.OpsAuthController;
import com.mfg.platform.identity.dto.RegisterRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 供应商入驻：运营邀请 → 凭链接注册 → 登录（2026-09-18 需求方拍板，设计文档 11）。
 *
 * <p>钉死的规则：只能运营邀请；链接 7 天有效、用一次失效、可作废；注册只填公司名 + 联系人 + 密码，
 * 邮箱就是邀请上的那个（推导：防链接转手）；链接明文不入库。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class SupplierInviteIT {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private StringRedisTemplate redis;

    @Autowired
    private OrganizationRepository organizations;

    @Autowired
    private OpsUserRepository opsUsers;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void flushRedis() {
        redis.execute((RedisConnection c) -> {
            c.serverCommands().flushDb();
            return null;
        });
    }

    @Test
    void anInvitedSupplierRegistersAndSignsIn() throws Exception {
        String ops = opsToken();
        String email = uniqueEmail("Sup.One");
        JsonNode invite = createInvite(ops, "Suzhou Precision", email);
        assertThat(invite.path("email").asText()).isEqualTo(email.toLowerCase());
        assertThat(invite.path("status").asText()).isEqualTo("PENDING");
        String token = invite.path("token").asText();
        assertThat(token).hasSizeGreaterThanOrEqualTo(40);

        JsonNode check = get("/auth/supplier-invites/" + token, null).path("data");
        assertThat(check.path("orgName").asText()).isEqualTo("Suzhou Precision");
        assertThat(check.path("email").asText()).isEqualTo(email.toLowerCase());

        ResponseEntity<String> reg = register(token, "Suzhou Precision Co.", "Wang", "supplierpw1");
        assertThat(reg.getStatusCode().value()).as(reg.getBody()).isEqualTo(200);

        JsonNode login = post("/auth/login", new ExternalAuthController.ExternalLoginRequest(email, "supplierpw1"), null)
                .path("data");
        assertThat(login.path("portalType").asText()).isEqualTo("SUPPLIER");
        assertThat(rawGet("/supplier/whoami", login.path("accessToken").asText()).getStatusCode().value())
                .isEqualTo(200);
        UUID orgId = jdbc.queryForObject("select org_id from external_user where email = ?", UUID.class,
                email.toLowerCase());
        assertThat(jdbc.queryForObject("select type || ':' || name from organization where id = ?", String.class,
                orgId)).isEqualTo("SUPPLIER:Suzhou Precision Co.");

        // 用过就失效
        assertGone(rawGet("/auth/supplier-invites/" + token, null));
        assertGone(register(token, "Again", "Li", "supplierpw2"));
        JsonNode listed = findById(get("/ops/supplier-invites", ops).path("data"), invite.path("id").asText());
        assertThat(listed.path("status").asText()).isEqualTo("USED");
        assertThat(listed.has("token")).isFalse();
    }

    @Test
    void theLinkIsNeverStoredInPlainText() throws Exception {
        String ops = opsToken();
        String token = createInvite(ops, "Hash Co", uniqueEmail("hash")).path("token").asText();
        assertThat(jdbc.queryForObject("select count(*) from supplier_invite where token_hash = ?", Long.class, token))
                .isZero();
        assertThat(jdbc.queryForObject("select count(*) from supplier_invite where token_hash = ?", Long.class,
                sha256(token))).isEqualTo(1);
    }

    @Test
    void expiredRevokedAndUnknownLinksAreRefused() throws Exception {
        String ops = opsToken();
        JsonNode expired = createInvite(ops, "Old Co", uniqueEmail("old"));
        jdbc.update("update supplier_invite set expires_at = now() - interval '1 minute' where id = ?",
                UUID.fromString(expired.path("id").asText()));
        assertGone(rawGet("/auth/supplier-invites/" + expired.path("token").asText(), null));
        assertGone(register(expired.path("token").asText(), "Old Co", "Li", "supplierpw1"));

        JsonNode revoked = createInvite(ops, "Revoked Co", uniqueEmail("rev"));
        ResponseEntity<String> r = rawPost("/ops/supplier-invites/" + revoked.path("id").asText() + "/revoke", null, ops);
        assertThat(r.getStatusCode().value()).as(r.getBody()).isEqualTo(200);
        assertThat(json.readTree(r.getBody()).path("data").path("status").asText()).isEqualTo("REVOKED");
        assertGone(register(revoked.path("token").asText(), "Revoked Co", "Li", "supplierpw1"));

        assertGone(rawGet("/auth/supplier-invites/" + UUID.randomUUID(), null));

        JsonNode list = get("/ops/supplier-invites", ops).path("data");
        assertThat(findById(list, expired.path("id").asText()).path("status").asText()).isEqualTo("EXPIRED");
        assertThat(findById(list, revoked.path("id").asText()).path("status").asText()).isEqualTo("REVOKED");
        assertThat(jdbc.queryForObject("select count(*) from organization where name in ('Old Co', 'Revoked Co')",
                Long.class)).isZero();
    }

    @Test
    void suppliersCannotSelfRegisterAndInvitesNeedAFreshEmail() throws Exception {
        ResponseEntity<String> self = rawPost("/auth/register", new RegisterRequest(PartyType.SUPPLIER, "Self Co",
                "CN", uniqueEmail("self"), "supplierpw1", "Self"), null);
        assertThat(self.getStatusCode().value()).isEqualTo(400);

        String ops = opsToken();
        String taken = uniqueEmail("taken");
        post("/auth/register", new RegisterRequest(PartyType.CUSTOMER, "Taken GmbH", "DE", taken, "password123",
                "Alice"), null);
        ResponseEntity<String> dup = rawPost("/ops/supplier-invites", new InviteBody("Taken", taken), ops);
        assertThat(dup.getStatusCode().value()).as(dup.getBody()).isEqualTo(409);
        assertThat(messageOf(dup)).isEqualTo("auth.email_taken");

        for (InviteBody bad : List.of(new InviteBody("", uniqueEmail("x")), new InviteBody("X", "not-an-email"))) {
            assertThat(rawPost("/ops/supplier-invites", bad, ops).getStatusCode().value()).isEqualTo(400);
        }
    }

    @Test
    void registrationValidatesItsFields() throws Exception {
        String ops = opsToken();
        String token = createInvite(ops, "Valid Co", uniqueEmail("valid")).path("token").asText();
        assertThat(register(token, "", "Wang", "supplierpw1").getStatusCode().value()).isEqualTo(400);
        assertThat(register(token, "Valid Co", "", "supplierpw1").getStatusCode().value()).isEqualTo(400);
        assertThat(register(token, "Valid Co", "Wang", "short").getStatusCode().value()).isEqualTo(400);
        // 校验失败不消耗邀请
        assertThat(register(token, "Valid Co", "Wang", "supplierpw1").getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void registeringTwiceAtOnceCreatesOneSupplier() throws Exception {
        String ops = opsToken();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int round = 0; round < 10; round++) {
                String email = uniqueEmail("race" + round);
                String name = "Race Co " + round;
                String token = createInvite(ops, name, email).path("token").asText();
                CyclicBarrier go = new CyclicBarrier(2);
                Future<ResponseEntity<String>> a = pool.submit(() -> {
                    go.await();
                    return register(token, name, "A", "supplierpw1");
                });
                Future<ResponseEntity<String>> b = pool.submit(() -> {
                    go.await();
                    return register(token, name, "B", "supplierpw1");
                });
                List<Integer> codes = List.of(a.get().getStatusCode().value(), b.get().getStatusCode().value());
                assertThat(codes).as("round %d", round).containsExactlyInAnyOrder(200, 410);
                assertThat(jdbc.queryForObject("select count(*) from external_user where email = ?", Long.class,
                        email.toLowerCase())).as("round %d", round).isEqualTo(1);
            }
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void onlyOperatorsManageInvites() throws Exception {
        String email = uniqueEmail("cust");
        post("/auth/register", new RegisterRequest(PartyType.CUSTOMER, "Cust GmbH", "DE", email, "password123",
                "Alice"), null);
        String customer = post("/auth/login", new ExternalAuthController.ExternalLoginRequest(email, "password123"),
                null).path("data").path("accessToken").asText();
        assertThat(rawPost("/ops/supplier-invites", new InviteBody("X", uniqueEmail("y")), customer)
                .getStatusCode().value()).isEqualTo(403);
        assertThat(rawGet("/ops/supplier-invites", customer).getStatusCode().value()).isEqualTo(403);
        assertThat(rawGet("/ops/supplier-invites", null).getStatusCode().value()).isEqualTo(401);
    }

    // ---------- helpers ----------

    private record InviteBody(String orgName, String email) {
    }

    private record RegisterBody(String orgName, String displayName, String password) {
    }

    private JsonNode createInvite(String ops, String orgName, String email) throws Exception {
        ResponseEntity<String> res = rawPost("/ops/supplier-invites", new InviteBody(orgName, email), ops);
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
        return json.readTree(res.getBody()).path("data");
    }

    private ResponseEntity<String> register(String token, String orgName, String displayName, String password) {
        return rawPost("/auth/supplier-invites/" + token + "/register",
                new RegisterBody(orgName, displayName, password), null);
    }

    private void assertGone(ResponseEntity<String> res) throws Exception {
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(410);
        assertThat(messageOf(res)).isEqualTo("auth.invite_invalid");
    }

    private String opsToken() throws Exception {
        String email = "invite-ops-" + UUID.randomUUID() + "@example.com";
        Organization internal = organizations.save(new Organization(Organization.Type.INTERNAL, "HQ invite", null));
        opsUsers.save(new OpsUser(internal.getId(), email, "Ops", passwordEncoder.encode("password123")));
        return post("/auth/internal/login", new OpsAuthController.OpsLoginRequest(email, "password123"), null)
                .path("data").path("accessToken").asText();
    }

    private static String uniqueEmail(String tag) {
        return tag + "-" + UUID.randomUUID().toString().substring(0, 8) + "@Example.com";
    }

    private static String sha256(String s) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
    }

    private static JsonNode findById(JsonNode items, String id) {
        for (JsonNode n : items) {
            if (n.path("id").asText().equals(id)) {
                return n;
            }
        }
        throw new AssertionError("not found: " + id);
    }

    private JsonNode post(String path, Object body, String bearer) throws Exception {
        return json.readTree(rawPost(path, body, bearer).getBody());
    }

    private JsonNode get(String path, String bearer) throws Exception {
        ResponseEntity<String> res = rawGet(path, bearer);
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
        return json.readTree(res.getBody());
    }

    private ResponseEntity<String> rawPost(String path, Object body, String bearer) {
        return exchange(path, HttpMethod.POST, body, bearer);
    }

    private ResponseEntity<String> rawGet(String path, String bearer) {
        return exchange(path, HttpMethod.GET, null, bearer);
    }

    private ResponseEntity<String> exchange(String path, HttpMethod method, Object body, String bearer) {
        HttpHeaders headers = new HttpHeaders();
        if (body != null) {
            headers.setContentType(MediaType.APPLICATION_JSON);
        }
        if (bearer != null) {
            headers.setBearerAuth(bearer);
        }
        return rest.exchange("http://localhost:" + port + path, method, new HttpEntity<>(body, headers), String.class);
    }

    private String messageOf(ResponseEntity<String> res) throws Exception {
        return json.readTree(res.getBody()).path("message").asText();
    }
}
