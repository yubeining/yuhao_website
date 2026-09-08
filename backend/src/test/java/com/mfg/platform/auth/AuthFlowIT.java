package com.mfg.platform.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mfg.common.security.PartyType;
import com.mfg.platform.identity.Organization;
import com.mfg.platform.identity.OpsUser;
import com.mfg.platform.identity.OpsUserRepository;
import com.mfg.platform.identity.OrganizationRepository;
import com.mfg.platform.identity.dto.RegisterRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 注册 → 登录 → 读自己公司 的端到端(真 Tomcat + 真 filter chain + 真库/Redis),
 * 外加受众隔离(客户 token 打供应商端 403)和内部登录独立入口。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class AuthFlowIT {

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

    @Test
    void externalRegisterLoginAndReadOwnOrg() throws Exception {
        String email = "c-" + UUID.randomUUID() + "@example.com";

        // 注册
        JsonNode reg = post("/auth/register",
                new RegisterRequest(PartyType.CUSTOMER, "Acme GmbH", "DE", email, "password123", "Alice"), null);
        assertThat(reg.path("data").path("email").asText()).isEqualTo(email);
        assertThat(reg.path("data").path("orgId").asText()).isNotBlank();

        // 登录:只凭账号+密码,受众由后端推出
        JsonNode login = post("/auth/login",
                new ExternalAuthController.ExternalLoginRequest(email, "password123"), null);
        assertThat(login.path("data").path("portalType").asText()).isEqualTo("CUSTOMER");
        String token = login.path("data").path("accessToken").asText();
        assertThat(token).isNotBlank();

        // 读自己公司
        JsonNode org = get("/customer/organization", token);
        assertThat(org.path("data").path("type").asText()).isEqualTo("CUSTOMER");
        assertThat(org.path("data").path("name").asText()).isEqualTo("Acme GmbH");

        // 本公司成员:只有刚注册这一个
        JsonNode members = get("/customer/organization/members", token);
        assertThat(members.path("data").path("total").asInt()).isEqualTo(1);
        assertThat(members.path("data").path("items").get(0).path("email").asText()).isEqualTo(email);
        assertThat(members.path("data").path("page").asInt()).isEqualTo(1);   // 1-based
    }

    @Test
    void customerTokenCannotHitSupplierPortal() throws Exception {
        String email = "c2-" + UUID.randomUUID() + "@example.com";
        post("/auth/register",
                new RegisterRequest(PartyType.CUSTOMER, "Beta", "FR", email, "password123", "Bob"), null);
        String token = post("/auth/login",
                new ExternalAuthController.ExternalLoginRequest(email, "password123"), null)
                .path("data").path("accessToken").asText();

        ResponseEntity<String> res = rawGet("/supplier/organization", token);
        assertThat(res.getStatusCode().value()).isEqualTo(403);
    }

    @Test
    void opsLoginViaInternalEndpointThenListOrganizations() throws Exception {
        String email = "ops-" + UUID.randomUUID() + "@example.com";
        Organization internal = organizations.save(new Organization(Organization.Type.INTERNAL, "HQ", null));
        opsUsers.save(new OpsUser(internal.getId(), email, "Olivia", passwordEncoder.encode("password123")));

        JsonNode login = post("/auth/internal/login",
                new OpsAuthController.OpsLoginRequest(email, "password123"), null);
        assertThat(login.path("data").path("portalType").asText()).isEqualTo("OPERATOR");
        String token = login.path("data").path("accessToken").asText();

        JsonNode orgs = get("/ops/organizations", token);
        assertThat(orgs.path("data").path("total").asInt()).isGreaterThanOrEqualTo(1);
    }

    @Test
    void opsAccountCannotLoginViaExternalEndpoint() throws Exception {
        // 运营号只在 ops_user 表,外部登录查的是 external_user —— 天然登不进(401,不是 200)
        String email = "opsx-" + UUID.randomUUID() + "@example.com";
        Organization internal = organizations.save(new Organization(Organization.Type.INTERNAL, "HQ2", null));
        opsUsers.save(new OpsUser(internal.getId(), email, "Op", passwordEncoder.encode("password123")));

        ResponseEntity<String> res = rawPost("/auth/login",
                new ExternalAuthController.ExternalLoginRequest(email, "password123"), null);
        assertThat(res.getStatusCode().value()).isEqualTo(401);
    }

    // ---------- helpers ----------

    private JsonNode post(String path, Object body, String bearer) throws Exception {
        return json.readTree(rawPost(path, body, bearer).getBody());
    }

    private ResponseEntity<String> rawPost(String path, Object body) {
        return rawPost(path, body, null);
    }

    private ResponseEntity<String> rawPost(String path, Object body, String bearer) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
        if (bearer != null) {
            headers.setBearerAuth(bearer);
        }
        return rest.postForEntity(url(path), new HttpEntity<>(body, headers), String.class);
    }

    private JsonNode get(String path, String bearer) throws Exception {
        return json.readTree(rawGet(path, bearer).getBody());
    }

    private ResponseEntity<String> rawGet(String path, String bearer) {
        HttpHeaders headers = new HttpHeaders();
        if (bearer != null) {
            headers.setBearerAuth(bearer);
        }
        return rest.exchange(url(path), HttpMethod.GET, new HttpEntity<>(headers), String.class);
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }
}
