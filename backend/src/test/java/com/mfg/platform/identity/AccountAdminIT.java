package com.mfg.platform.identity;

import com.mfg.platform.auth.ExternalAuthController;
import com.mfg.platform.auth.OpsAuthController;
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

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 运营端账号管理：外部用户 / 组织 / 运营账号的增删改查。
 *
 * <p>重点验证三件事：
 * <ol>
 *   <li>「删除 = 禁用」是真的生效 —— 禁用后<u>密码登录必须失败</u>，不只是列表里改个字</li>
 *   <li>组织类型不可改、外部用户不能挂到 INTERNAL 组织下</li>
 *   <li>非运营 principal 打这些端点一律 403（端级闸门没被新端点绕开）</li>
 * </ol>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class AccountAdminIT {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private OrganizationRepository organizations;

    @Autowired
    private OpsUserRepository opsUsers;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private StringRedisTemplate redis;

    private String opsToken;

    @BeforeEach
    void setUp() throws Exception {
        redis.execute((org.springframework.data.redis.connection.RedisConnection c) -> {
            c.serverCommands().flushDb();
            return null;
        });
        String email = "ops-" + UUID.randomUUID() + "@example.com";
        Organization internal = organizations.save(new Organization(Organization.Type.INTERNAL, "HQ", null));
        opsUsers.save(new OpsUser(internal.getId(), email, "Olivia", passwordEncoder.encode("password123")));
        JsonNode login = json.readTree(rawPost("/auth/internal/login",
                new OpsAuthController.OpsLoginRequest(email, "password123"), null).getBody());
        opsToken = login.path("data").path("accessToken").asText();
        assertThat(opsToken).isNotBlank();
    }

    // ---------- 组织 ----------

    @Test
    void createUpdateAndDisableOrganization() throws Exception {
        String name = "Neue Firma " + UUID.randomUUID();
        JsonNode created = json.readTree(rawPost("/ops/organizations",
                Map.of("type", "CUSTOMER", "name", name, "country", "DE"), opsToken).getBody()).path("data");
        String orgId = created.path("id").asText();
        assertThat(created.path("status").asText()).isEqualTo("ACTIVE");

        // 改名
        JsonNode renamed = json.readTree(rawPatch("/ops/organizations/" + orgId,
                Map.of("name", name + " (edited)"), opsToken).getBody()).path("data");
        assertThat(renamed.path("name").asText()).endsWith("(edited)");

        // 删除 = 禁用
        JsonNode disabled = json.readTree(rawDelete("/ops/organizations/" + orgId, opsToken).getBody()).path("data");
        assertThat(disabled.path("status").asText()).isEqualTo("DISABLED");

        // 数据还在（逻辑删除，不是物理删除）
        assertThat(organizations.findById(UUID.fromString(orgId))).isPresent();
    }

    @Test
    void organizationTypeCannotBeChangedByUpdate() throws Exception {
        String orgId = createOrg("CUSTOMER", "Type Test " + UUID.randomUUID());
        // 请求体里塞 type 也不会生效 —— UpdateOrganization 记录里根本没有这个字段
        json.readTree(rawPatch("/ops/organizations/" + orgId,
                Map.of("name", "Renamed", "type", "INTERNAL"), opsToken).getBody());
        Organization reloaded = organizations.findById(UUID.fromString(orgId)).orElseThrow();
        assertThat(reloaded.getType()).isEqualTo(Organization.Type.CUSTOMER);
    }

    // ---------- 外部用户 ----------

    @Test
    void createExternalUserCanLoginThenDisableBlocksLogin() throws Exception {
        String orgId = createOrg("CUSTOMER", "Buyer GmbH " + UUID.randomUUID());
        String email = "buyer-" + UUID.randomUUID() + "@example.com";

        JsonNode created = json.readTree(rawPost("/ops/users", Map.of(
                "orgId", orgId, "email", email, "displayName", "Bruno",
                "password", "password123", "locale", "de"), opsToken).getBody()).path("data");
        String userId = created.path("id").asText();
        assertThat(created.path("orgName").asText()).contains("Buyer GmbH");
        // 新建的账号邮箱还没验证过 —— 不要因为"运营建的"就当已验证
        assertThat(created.hasNonNull("emailVerifiedAt")).isFalse();

        // 真实密码登录（走和外网用户同一条路）
        JsonNode login = json.readTree(rawPost("/auth/login",
                new ExternalAuthController.ExternalLoginRequest(email, "password123"), null).getBody());
        assertThat(login.path("data").path("portalType").asText()).isEqualTo("CUSTOMER");

        // 删除 = 禁用，之后登录必须失败
        JsonNode disabled = json.readTree(rawDelete("/ops/users/" + userId, opsToken).getBody()).path("data");
        assertThat(disabled.path("status").asText()).isEqualTo("DISABLED");

        ResponseEntity<String> denied = rawPost("/auth/login",
                new ExternalAuthController.ExternalLoginRequest(email, "password123"), null);
        assertThat(denied.getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void duplicateEmailIsRejected() throws Exception {
        String orgId = createOrg("CUSTOMER", "Dupe GmbH " + UUID.randomUUID());
        String email = "dupe-" + UUID.randomUUID() + "@example.com";
        Map<String, Object> body = Map.of("orgId", orgId, "email", email,
                "displayName", "Dup", "password", "password123");
        assertThat(rawPost("/ops/users", body, opsToken).getStatusCode().value()).isEqualTo(200);
        ResponseEntity<String> again = rawPost("/ops/users", body, opsToken);
        assertThat(again.getStatusCode().value()).isEqualTo(409);
    }

    @Test
    void externalUserCannotBeAttachedToInternalOrg() throws Exception {
        Organization internal = organizations.findAll().stream()
                .filter(o -> o.getType() == Organization.Type.INTERNAL).findFirst().orElseThrow();
        ResponseEntity<String> res = rawPost("/ops/users", Map.of(
                "orgId", internal.getId().toString(),
                "email", "x-" + UUID.randomUUID() + "@example.com",
                "displayName", "X", "password", "password123"), opsToken);
        assertThat(res.getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void searchMatchesEmailAndOrgName() throws Exception {
        String marker = "Searchable" + UUID.randomUUID().toString().substring(0, 8);
        String orgId = createOrg("CUSTOMER", marker + " GmbH");
        rawPost("/ops/users", Map.of("orgId", orgId, "email", "a-" + UUID.randomUUID() + "@example.com",
                "displayName", "A", "password", "password123"), opsToken);

        JsonNode byOrgName = json.readTree(rawGet("/ops/users?q=" + marker, opsToken).getBody());
        assertThat(byOrgName.path("data").path("total").asInt()).isEqualTo(1);
    }

    // ---------- 运营账号 ----------

    @Test
    void createStaffAndDisable() throws Exception {
        Organization internal = organizations.findAll().stream()
                .filter(o -> o.getType() == Organization.Type.INTERNAL).findFirst().orElseThrow();
        String email = "staff-" + UUID.randomUUID() + "@example.com";

        JsonNode created = json.readTree(rawPost("/ops/staff", Map.of(
                "orgId", internal.getId().toString(), "email", email,
                "displayName", "Sam", "password", "password123"), opsToken).getBody()).path("data");
        assertThat(created.path("email").asText()).isEqualTo(email);

        // 新建的运营号能登进内部后台
        JsonNode login = json.readTree(rawPost("/auth/internal/login",
                new OpsAuthController.OpsLoginRequest(email, "password123"), null).getBody());
        assertThat(login.path("data").path("portalType").asText()).isEqualTo("OPERATOR");

        // 禁用后登不进
        rawDelete("/ops/staff/" + created.path("id").asText(), opsToken);
        ResponseEntity<String> denied = rawPost("/auth/internal/login",
                new OpsAuthController.OpsLoginRequest(email, "password123"), null);
        assertThat(denied.getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void staffCannotBeCreatedUnderCustomerOrg() throws Exception {
        String orgId = createOrg("CUSTOMER", "Not Internal " + UUID.randomUUID());
        ResponseEntity<String> res = rawPost("/ops/staff", Map.of(
                "orgId", orgId, "email", "bad-" + UUID.randomUUID() + "@example.com",
                "displayName", "Bad", "password", "password123"), opsToken);
        assertThat(res.getStatusCode().value()).isEqualTo(400);
    }

    // ---------- 受众隔离 ----------

    @Test
    void customerTokenCannotReachAccountAdmin() throws Exception {
        String email = "cust-" + UUID.randomUUID() + "@example.com";
        rawPost("/auth/register", Map.of("portalType", "CUSTOMER", "orgName", "Cust GmbH",
                "country", "DE", "email", email, "password", "password123", "displayName", "C"), null);
        JsonNode login = json.readTree(rawPost("/auth/login",
                new ExternalAuthController.ExternalLoginRequest(email, "password123"), null).getBody());
        String customerToken = login.path("data").path("accessToken").asText();

        assertThat(rawGet("/ops/users", customerToken).getStatusCode().value()).isEqualTo(403);
        assertThat(rawGet("/ops/staff", customerToken).getStatusCode().value()).isEqualTo(403);
        assertThat(rawGet("/ops/organizations", customerToken).getStatusCode().value()).isEqualTo(403);
    }

    // ---------- helpers ----------

    private String createOrg(String type, String name) throws Exception {
        return json.readTree(rawPost("/ops/organizations",
                Map.of("type", type, "name", name, "country", "DE"), opsToken).getBody())
                .path("data").path("id").asText();
    }

    private ResponseEntity<String> rawPost(String path, Object body, String bearer) throws Exception {
        return exchange(HttpMethod.POST, path, body, bearer);
    }

    private ResponseEntity<String> rawPatch(String path, Object body, String bearer) throws Exception {
        return exchange(HttpMethod.PATCH, path, body, bearer);
    }

    private ResponseEntity<String> rawDelete(String path, String bearer) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(bearer);
        return rest.exchange(url(path), HttpMethod.DELETE, new HttpEntity<>(headers), String.class);
    }

    private ResponseEntity<String> rawGet(String path, String bearer) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(bearer);
        return rest.exchange(url(path), HttpMethod.GET, new HttpEntity<>(headers), String.class);
    }

    private ResponseEntity<String> exchange(HttpMethod method, String path, Object body, String bearer)
            throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) {
            headers.setBearerAuth(bearer);
        }
        String payload = json.writeValueAsString(body);
        return rest.exchange(url(path), method, new HttpEntity<>(payload, headers), String.class);
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }
}
