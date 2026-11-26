package com.mfg.domain.address;

import com.mfg.common.security.PartyType;
import com.mfg.platform.auth.ExternalAuthController;
import com.mfg.platform.auth.OpsAuthController;
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
import org.springframework.data.redis.connection.RedisConnection;
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

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 收货地址簿端到端（2026-11-26 需求方拍板，changelog/2026-11-26_shipping-address-book）。
 *
 * <p>真 Tomcat + 真过滤链 + 真 PostgreSQL + 真 Redis。钉死的规则：
 * <ul>
 *   <li>按个人账号归属：别人的地址看不到、改不了（一律 404）。</li>
 *   <li>第一条自动成为默认；删掉默认后，剩下最早加的那条顶上（Q8）。</li>
 *   <li>每人最多 20 条（Q9）。</li>
 *   <li>运营只读（Q10）。</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class ShippingAddressFlowIT {

    private static final String BASE = "/customer/shipping-addresses";

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private StringRedisTemplate redis;

    @Autowired
    private OrganizationRepository organizations;

    @Autowired
    private OpsUserRepository opsUsers;

    @Autowired
    private PasswordEncoder passwordEncoder;

    /** 注册按来源 IP 限流，测试全从 localhost 发；每个用例前清测试 Redis db（同 CustomerOrderFlowIT）。 */
    @BeforeEach
    void flushRedis() {
        redis.execute((RedisConnection c) -> {
            c.serverCommands().flushDb();
            return null;
        });
    }

    @Test
    void firstAddressBecomesDefaultAndTheDefaultIsListedFirst() throws Exception {
        Customer c = register("first");
        assertThat(list(c)).isEmpty();

        JsonNode first = create(c, address("Berlin"), false);
        assertThat(first.path("isDefault").asBoolean()).isTrue();
        assertThat(first.path("country").asText()).isEqualTo("DE");
        assertThat(first.path("company").asText()).isEqualTo("Acme Receiving GmbH");
        // 选填项没填 → 字段不出现（接口不输出 null）
        assertThat(first.has("line2")).isFalse();
        // 白名单：不输出所有者
        assertThat(first.has("externalUserId")).isFalse();

        JsonNode second = create(c, address("Munich"), false);
        assertThat(second.path("isDefault").asBoolean()).isFalse();

        ok(rawPost(BASE + "/" + second.path("id").asText() + "/default", null, c.token()));
        List<JsonNode> items = list(c);
        assertThat(items).extracting(n -> n.path("city").asText()).containsExactly("Munich", "Berlin");
        assertThat(items).extracting(n -> n.path("isDefault").asBoolean()).containsExactly(true, false);
    }

    @Test
    void creatingWithMakeDefaultTakesOverTheDefault() throws Exception {
        Customer c = register("makedefault");
        create(c, address("Berlin"), false);
        create(c, address("Munich"), true);
        assertThat(list(c)).extracting(n -> n.path("city").asText() + ":" + n.path("isDefault").asBoolean())
                .containsExactly("Munich:true", "Berlin:false");
    }

    @Test
    void deletingTheDefaultPromotesTheEarliestRemainingAddress() throws Exception {
        Customer c = register("promote");
        String berlin = create(c, address("Berlin"), false).path("id").asText();
        create(c, address("Munich"), false);
        create(c, address("Hamburg"), false);

        ok(rawDelete(BASE + "/" + berlin, c.token()));
        assertThat(list(c)).extracting(n -> n.path("city").asText() + ":" + n.path("isDefault").asBoolean())
                .containsExactly("Munich:true", "Hamburg:false");
    }

    @Test
    void deletingANonDefaultAddressKeepsTheDefault() throws Exception {
        Customer c = register("keepdefault");
        create(c, address("Berlin"), false);
        String munich = create(c, address("Munich"), false).path("id").asText();

        ok(rawDelete(BASE + "/" + munich, c.token()));
        assertThat(list(c)).extracting(n -> n.path("city").asText() + ":" + n.path("isDefault").asBoolean())
                .containsExactly("Berlin:true");

        ok(rawDelete(BASE + "/" + list(c).getFirst().path("id").asText(), c.token()));
        assertThat(list(c)).isEmpty();
    }

    @Test
    void updateReplacesAllFieldsAndCannotUnsetTheDefault() throws Exception {
        Customer c = register("update");
        JsonNode created = create(c, new CustomerShippingAddressController.AddressRequest("DE", "Acme", "Bob",
                "+49 30 1", "Str. 1", "2. OG", "Berlin", "BE", "10115", null));
        String id = created.path("id").asText();

        JsonNode updated = json.readTree(ok(rawPut(BASE + "/" + id,
                new CustomerShippingAddressController.AddressRequest("GB", " Example Ltd ", "Jane", "+44 20 1",
                        "1 Sample Road", null, "Leeds", null, "AB1 2CD", false), c.token())).getBody()).path("data");
        assertThat(updated.path("country").asText()).isEqualTo("GB");
        assertThat(updated.path("company").asText()).isEqualTo("Example Ltd");
        assertThat(updated.has("line2")).isFalse();
        assertThat(updated.has("region")).isFalse();
        // 唯一的默认地址不能被取消：总有一个默认（Q8）
        assertThat(updated.path("isDefault").asBoolean()).isTrue();
    }

    @Test
    void rejectsMissingRequiredFieldsAndUnknownCountries() throws Exception {
        Customer c = register("invalid");
        assertThat(rawPost(BASE, new CustomerShippingAddressController.AddressRequest("DE", " ", "Bob", "+49 1",
                "Str. 1", null, "Berlin", null, null, null), c.token()).getStatusCode().value()).isEqualTo(400);
        assertThat(rawPost(BASE, new CustomerShippingAddressController.AddressRequest("DE", "Acme", "Bob", "+49 1",
                "Str. 1", null, null, null, null, null), c.token()).getStatusCode().value()).isEqualTo(400);
        ResponseEntity<String> xx = rawPost(BASE, new CustomerShippingAddressController.AddressRequest("XX", "Acme",
                "Bob", "+49 1", "Str. 1", null, "Berlin", null, null, null), c.token());
        assertThat(xx.getStatusCode().value()).as(xx.getBody()).isEqualTo(400);
        assertThat(messageOf(xx)).isEqualTo("address.country_invalid");
        assertThat(list(c)).isEmpty();
    }

    @Test
    void atMostTwentyAddressesPerUser() throws Exception {
        Customer c = register("limit");
        for (int i = 0; i < 20; i++) {
            create(c, address("City-" + i), false);
        }
        ResponseEntity<String> res = rawPost(BASE, address("One-too-many"), c.token());
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(409);
        assertThat(messageOf(res)).isEqualTo("address.limit_reached");
        assertThat(list(c)).hasSize(20);
    }

    @Test
    void anotherUsersAddressesAreInvisibleAndUntouchable() throws Exception {
        Customer owner = register("owner");
        Customer other = register("other");
        String id = create(owner, address("Berlin"), false).path("id").asText();

        assertThat(list(other)).isEmpty();
        assertNotFound(rawPut(BASE + "/" + id, address("Hacked"), other.token()));
        assertNotFound(rawDelete(BASE + "/" + id, other.token()));
        assertNotFound(rawPost(BASE + "/" + id + "/default", null, other.token()));
        assertThat(list(owner)).extracting(n -> n.path("city").asText()).containsExactly("Berlin");
    }

    @Test
    void opsCanReadAUsersAddressBookButCustomersCannotUseTheOpsEndpoint() throws Exception {
        Customer c = register("opsview");
        create(c, address("Berlin"), false);
        create(c, address("Munich"), false);

        JsonNode items = json.readTree(ok(rawGet("/ops/users/" + c.userId() + "/shipping-addresses", opsToken()))
                .getBody()).path("data");
        List<String> cities = new ArrayList<>();
        items.forEach(n -> cities.add(n.path("city").asText()));
        assertThat(cities).containsExactly("Berlin", "Munich");

        int status = rawGet("/ops/users/" + c.userId() + "/shipping-addresses", c.token()).getStatusCode().value();
        assertThat(status).isIn(401, 403);
    }

    /** 智能粘贴的输入校验在调 AI 之前（测试环境不连真 AI，这里只测挡在外面的那部分）。 */
    @Test
    void parseRejectsBlankOrOverlongTextBeforeCallingTheAi() throws Exception {
        Customer c = register("parse");
        assertThat(rawPost(BASE + "/parse", new CustomerShippingAddressController.ParseRequest(" "), c.token())
                .getStatusCode().value()).isEqualTo(400);
        assertThat(rawPost(BASE + "/parse", new CustomerShippingAddressController.ParseRequest("x".repeat(1001)),
                c.token()).getStatusCode().value()).isEqualTo(400);
    }

    // ---------- 场景搭建 ----------

    private record Customer(String token, UUID userId) {
    }

    private Customer register(String tag) throws Exception {
        String email = "addr-" + tag + "-" + UUID.randomUUID() + "@example.com";
        JsonNode reg = post("/auth/register",
                new RegisterRequest(PartyType.CUSTOMER, "Acme " + tag, "DE", email, "password123", "Alice"), null);
        String token = post("/auth/login", new ExternalAuthController.ExternalLoginRequest(email, "password123"), null)
                .path("data").path("accessToken").asText();
        return new Customer(token, UUID.fromString(reg.path("data").path("id").asText()));
    }

    private String opsToken() throws Exception {
        String email = "addr-ops-" + UUID.randomUUID() + "@example.com";
        Organization internal = organizations.save(new Organization(Organization.Type.INTERNAL, "HQ addr", null));
        opsUsers.save(new OpsUser(internal.getId(), email, "Ops", passwordEncoder.encode("password123")));
        return post("/auth/internal/login", new OpsAuthController.OpsLoginRequest(email, "password123"), null)
                .path("data").path("accessToken").asText();
    }

    private static CustomerShippingAddressController.AddressRequest address(String city) {
        return new CustomerShippingAddressController.AddressRequest("DE", "Acme Receiving GmbH", "Bob Weber",
                "+49 30 1234567", "Hauptstr. 1", null, city, null, "10115", null);
    }

    private JsonNode create(Customer c, CustomerShippingAddressController.AddressRequest r, boolean makeDefault)
            throws Exception {
        return create(c, new CustomerShippingAddressController.AddressRequest(r.country(), r.company(), r.contact(),
                r.phone(), r.line1(), r.line2(), r.city(), r.region(), r.postalCode(), makeDefault));
    }

    private JsonNode create(Customer c, CustomerShippingAddressController.AddressRequest r) throws Exception {
        return json.readTree(ok(rawPost(BASE, r, c.token())).getBody()).path("data");
    }

    private List<JsonNode> list(Customer c) throws Exception {
        List<JsonNode> out = new ArrayList<>();
        json.readTree(ok(rawGet(BASE, c.token())).getBody()).path("data").forEach(out::add);
        return out;
    }

    private ResponseEntity<String> ok(ResponseEntity<String> res) {
        assertThat(res.getStatusCode().is2xxSuccessful()).as(res.getBody()).isTrue();
        return res;
    }

    private void assertNotFound(ResponseEntity<String> res) {
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(404);
    }

    // ---------- HTTP helpers（请求体走项目 ObjectMapper，不手写 JSON） ----------

    private JsonNode post(String path, Object body, String bearer) throws Exception {
        return json.readTree(rawPost(path, body, bearer).getBody());
    }

    private ResponseEntity<String> rawPost(String path, Object body, String bearer) {
        return exchange(path, HttpMethod.POST, body, bearer);
    }

    private ResponseEntity<String> rawPut(String path, Object body, String bearer) {
        return exchange(path, HttpMethod.PUT, body, bearer);
    }

    private ResponseEntity<String> rawGet(String path, String bearer) {
        return exchange(path, HttpMethod.GET, null, bearer);
    }

    private ResponseEntity<String> rawDelete(String path, String bearer) {
        return exchange(path, HttpMethod.DELETE, null, bearer);
    }

    private ResponseEntity<String> exchange(String path, HttpMethod method, Object body, String bearer) {
        HttpHeaders headers = new HttpHeaders();
        if (body != null) {
            headers.setContentType(MediaType.APPLICATION_JSON);
        }
        if (bearer != null) {
            headers.setBearerAuth(bearer);
        }
        return rest.exchange(url(path), method, new HttpEntity<>(body, headers), String.class);
    }

    private String messageOf(ResponseEntity<String> res) throws Exception {
        return json.readTree(res.getBody()).path("message").asText();
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }
}
