package com.mfg.domain.supplier;

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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 供应商资料：运营录折率和能力（2026-09-18 需求方拍板，设计文档 11 / 13 §2.2）。
 *
 * <p>钉死的规则：折率填 0.8 = 乘 0.8；录好折率（且组织启用）才能派单；能力是自由文本，可以后补。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class SupplierDirectoryIT {

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

    @Autowired
    private SupplierDirectory directory;

    @BeforeEach
    void flushRedis() {
        redis.execute((RedisConnection c) -> {
            c.serverCommands().flushDb();
            return null;
        });
    }

    @Test
    void aSupplierBecomesDispatchableOnceItHasADiscount() throws Exception {
        String ops = opsToken();
        UUID sup = supplier("Discount Co");

        JsonNode before = findSupplier(ops, sup);
        assertThat(before.path("name").asText()).isEqualTo("Discount Co");
        assertThat(before.has("discountRate")).isFalse();
        assertThat(before.path("dispatchable").asBoolean()).isFalse();
        assertThat(directory.discountOf(sup)).isEmpty();
        assertThat(directory.dispatchable()).extracting(DispatchableSupplier::orgId).doesNotContain(sup);

        JsonNode set = put("/ops/suppliers/" + sup + "/discount", new DiscountBody(new BigDecimal("0.8")), ops);
        assertThat(set.path("discountRate").decimalValue()).isEqualByComparingTo("0.8");
        assertThat(set.path("dispatchable").asBoolean()).isTrue();
        assertThat(directory.discountOf(sup)).hasValueSatisfying(r -> assertThat(r).isEqualByComparingTo("0.8"));
        assertThat(directory.dispatchable()).extracting(DispatchableSupplier::orgId).contains(sup);
    }

    @Test
    void capabilityIsFreeTextAndDoesNotTouchTheDiscount() throws Exception {
        String ops = opsToken();
        UUID sup = supplier("Capability Co");
        put("/ops/suppliers/" + sup + "/capability",
                new CapabilityBody("CNC milling, turning", "AL6061, SUS304", "≤ 500 mm", "IT7"), ops);
        JsonNode s = findSupplier(ops, sup);
        assertThat(s.path("processes").asText()).isEqualTo("CNC milling, turning");
        assertThat(s.path("materials").asText()).isEqualTo("AL6061, SUS304");
        assertThat(s.path("sizeRange").asText()).isEqualTo("≤ 500 mm");
        assertThat(s.path("precisionGrade").asText()).isEqualTo("IT7");
        assertThat(s.path("dispatchable").asBoolean()).isFalse();

        put("/ops/suppliers/" + sup + "/discount", new DiscountBody(new BigDecimal("0.75")), ops);
        put("/ops/suppliers/" + sup + "/capability", new CapabilityBody("CNC milling", null, null, null), ops);
        JsonNode after = findSupplier(ops, sup);
        assertThat(after.path("discountRate").decimalValue()).isEqualByComparingTo("0.75");
        assertThat(after.path("processes").asText()).isEqualTo("CNC milling");
        assertThat(after.has("materials")).isFalse();
        assertThat(jdbc.queryForObject("select count(*) from supplier_profile where supplier_org_id = ?", Long.class,
                sup)).isEqualTo(1);
    }

    @Test
    void badInputAndWrongOrganizationsAreRefused() throws Exception {
        String ops = opsToken();
        UUID sup = supplier("Strict Co");
        for (Object rate : List.of(0, -1, new BigDecimal("0.12345"), "abc")) {
            ResponseEntity<String> res = rawPut("/ops/suppliers/" + sup + "/discount", Map.of("discountRate", rate), ops);
            assertThat(res.getStatusCode().value()).as("%s -> %s", rate, res.getBody()).isEqualTo(400);
        }
        ResponseEntity<String> tooLong = rawPut("/ops/suppliers/" + sup + "/capability",
                new CapabilityBody("x".repeat(501), null, null, null), ops);
        assertThat(tooLong.getStatusCode().value()).isEqualTo(400);

        UUID customer = organizations.save(new Organization(Organization.Type.CUSTOMER, "Not A Supplier", "DE")).getId();
        for (UUID wrong : List.of(customer, UUID.randomUUID())) {
            assertThat(rawPut("/ops/suppliers/" + wrong + "/discount", new DiscountBody(BigDecimal.ONE), ops)
                    .getStatusCode().value()).isEqualTo(404);
        }
        List<String> names = new ArrayList<>();
        get("/ops/suppliers", ops).path("data").forEach(n -> names.add(n.path("name").asText()));
        assertThat(names).contains("Strict Co").doesNotContain("Not A Supplier");
    }

    @Test
    void aDisabledSupplierIsNotDispatchable() throws Exception {
        String ops = opsToken();
        UUID sup = supplier("Disabled Co");
        put("/ops/suppliers/" + sup + "/discount", new DiscountBody(new BigDecimal("0.9")), ops);
        jdbc.update("update organization set status = 'DISABLED' where id = ?", sup);
        assertThat(findSupplier(ops, sup).path("dispatchable").asBoolean()).isFalse();
        assertThat(directory.dispatchable()).extracting(DispatchableSupplier::orgId).doesNotContain(sup);
    }

    @Test
    void settingTheFirstDiscountConcurrentlyNeverFails() throws Exception {
        String ops = opsToken();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int round = 0; round < 15; round++) {
                UUID sup = supplier("Race Co " + round);
                CyclicBarrier go = new CyclicBarrier(2);
                List<Future<ResponseEntity<String>>> puts = new ArrayList<>();
                puts.add(pool.submit(() -> {
                    go.await();
                    return rawPut("/ops/suppliers/" + sup + "/discount", new DiscountBody(new BigDecimal("0.8")), ops);
                }));
                puts.add(pool.submit(() -> {
                    go.await();
                    return rawPut("/ops/suppliers/" + sup + "/capability",
                            new CapabilityBody("milling", null, null, null), ops);
                }));
                for (Future<ResponseEntity<String>> f : puts) {
                    assertThat(f.get().getStatusCode().value()).as("round %d: %s", round, f.get().getBody())
                            .isEqualTo(200);
                }
                JsonNode s = findSupplier(ops, sup);
                assertThat(s.path("discountRate").decimalValue()).as("round %d", round).isEqualByComparingTo("0.8");
                assertThat(s.path("processes").asText()).as("round %d", round).isEqualTo("milling");
            }
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void onlyOperatorsSeeAndEditSupplierProfiles() throws Exception {
        UUID sup = supplier("Private Co");
        String email = "dir-cust-" + UUID.randomUUID() + "@example.com";
        post("/auth/register", new RegisterRequest(PartyType.CUSTOMER, "Cust GmbH", "DE", email, "password123",
                "Alice"), null);
        String customer = post("/auth/login", new ExternalAuthController.ExternalLoginRequest(email, "password123"),
                null).path("data").path("accessToken").asText();
        assertThat(rawGet("/ops/suppliers", customer).getStatusCode().value()).isEqualTo(403);
        assertThat(rawPut("/ops/suppliers/" + sup + "/discount", new DiscountBody(BigDecimal.ONE), customer)
                .getStatusCode().value()).isEqualTo(403);
    }

    // ---------- helpers ----------

    private record DiscountBody(BigDecimal discountRate) {
    }

    private record CapabilityBody(String processes, String materials, String sizeRange, String precisionGrade) {
    }

    private UUID supplier(String name) {
        return organizations.save(new Organization(Organization.Type.SUPPLIER, name, "CN")).getId();
    }

    private JsonNode findSupplier(String ops, UUID orgId) throws Exception {
        for (JsonNode n : get("/ops/suppliers", ops).path("data")) {
            if (n.path("orgId").asText().equals(orgId.toString())) {
                return n;
            }
        }
        throw new AssertionError("supplier not listed: " + orgId);
    }

    private String opsToken() throws Exception {
        String email = "dir-ops-" + UUID.randomUUID() + "@example.com";
        Organization internal = organizations.save(new Organization(Organization.Type.INTERNAL, "HQ dir", null));
        opsUsers.save(new OpsUser(internal.getId(), email, "Ops", passwordEncoder.encode("password123")));
        return post("/auth/internal/login", new OpsAuthController.OpsLoginRequest(email, "password123"), null)
                .path("data").path("accessToken").asText();
    }

    private JsonNode put(String path, Object body, String bearer) throws Exception {
        ResponseEntity<String> res = rawPut(path, body, bearer);
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
        return json.readTree(res.getBody()).path("data");
    }

    private JsonNode post(String path, Object body, String bearer) throws Exception {
        return json.readTree(exchange(path, HttpMethod.POST, body, bearer).getBody());
    }

    private JsonNode get(String path, String bearer) throws Exception {
        ResponseEntity<String> res = rawGet(path, bearer);
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
        return json.readTree(res.getBody());
    }

    private ResponseEntity<String> rawPut(String path, Object body, String bearer) {
        return exchange(path, HttpMethod.PUT, body, bearer);
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
}
