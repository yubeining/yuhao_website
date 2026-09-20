package com.mfg.domain.order;

import com.mfg.common.security.PartyType;
import com.mfg.platform.auth.ExternalAuthController;
import com.mfg.platform.auth.OpsAuthController;
import com.mfg.platform.identity.OpsUser;
import com.mfg.platform.identity.OpsUserRepository;
import com.mfg.platform.identity.Organization;
import com.mfg.platform.identity.OrganizationRepository;
import com.mfg.platform.identity.dto.RegisterRequest;
import com.mfg.platform.storage.StorageService;
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

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 合同：运营建合同 → 供应商签字锁定；7 天不签自动回待派（2026-09-20 需求方拍板，设计文档 12 §4）。
 *
 * <p>钉死的规则：
 * <ul>
 *   <li>本轮只做交互和签字，不生成 PDF、不写条款正文；合同页只展示系统里已有的数据。</li>
 *   <li>超时 <b>7 天，从供应商接单那一刻算起</b>（不是从建合同算）。到点没签 → 供应商订单取消、生产订单回组装中。</li>
 *   <li>签字前双方都能退（供应商退单 / 运营收回）；签字之后锁定，退不了也改不了。</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class ContractFlowIT {

    private static final byte[] PDF =
            "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n".getBytes(StandardCharsets.US_ASCII);
    private static final LocalDate RATE_DAY = LocalDate.of(2026, 9, 16);

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private StorageService storage;

    @Autowired
    private StringRedisTemplate redis;

    @Autowired
    private OrganizationRepository organizations;

    @Autowired
    private OpsUserRepository opsUsers;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private SignTimeoutJob signTimeout;

    private String ops;

    @BeforeEach
    void reset() throws Exception {
        redis.execute((RedisConnection c) -> {
            c.serverCommands().flushDb();
            return null;
        });
        jdbc.update("delete from fx_rate");
        jdbc.update("insert into fx_rate (source, rate_date, base_currency, quote_currency, rate, fetched_at)"
                + " values ('ECB', ?, 'EUR', 'CNY', 7.7380, now())", RATE_DAY);
        ops = opsToken();
    }

    @Test
    void theOperatorCreatesAContractAndTheSupplierSignsIt() throws Exception {
        Accepted a = accepted("sign");

        JsonNode pending = post("/ops/supplier-orders/" + a.supplierOrderId() + "/contract", null, ops);
        assertThat(pending.path("status").asText()).isEqualTo("CONTRACT_PENDING");
        assertThat(pending.path("contractCreatedAt").asText()).isNotEmpty();

        JsonNode mine = get("/supplier/orders/" + a.supplierOrderId(), a.supplier().token());
        assertThat(mine.path("status").asText()).isEqualTo("CONTRACT_PENDING");
        // 签字期限 = 接单时间 + 7 天（2026-09-20 拍板从接单算，不是从建合同算）
        assertThat(Instant.parse(mine.path("signByDeadline").asText()))
                .isEqualTo(Instant.parse(mine.path("acceptedAt").asText()).plus(Duration.ofDays(7)));
        assertThat(mine.path("lines")).hasSize(1);

        JsonNode signed = post("/supplier/orders/" + a.supplierOrderId() + "/sign", null, a.supplier().token());
        assertThat(signed.path("status").asText()).isEqualTo("CONTRACTED");
        assertThat(signed.path("signedAt").asText()).isNotEmpty();
        assertThat(get("/ops/ops-orders/" + a.opsOrderId(), ops).path("supplierOrders").get(0).path("status").asText())
                .isEqualTo("CONTRACTED");

        // 签了就锁定：不能再签、不能退、运营也收不回
        assertConflict(rawPost("/supplier/orders/" + a.supplierOrderId() + "/sign", null, a.supplier().token()),
                "dispatch.supplier_order_not_pending");
        assertConflict(rawPost("/supplier/orders/" + a.supplierOrderId() + "/withdraw", null, a.supplier().token()),
                "dispatch.contract_signed");
        assertConflict(rawPost("/ops/ops-orders/" + a.opsOrderId() + "/revoke-supplier", null, ops),
                "dispatch.contract_signed");
        assertConflict(exchange("/ops/supplier-orders/" + a.supplierOrderId() + "/contract", HttpMethod.DELETE, null, ops),
                "dispatch.contract_signed");
    }

    @Test
    void bothSidesCanStillBackOutBeforeSigning() throws Exception {
        Accepted a = accepted("before-sign");
        ok(rawPost("/ops/supplier-orders/" + a.supplierOrderId() + "/contract", null, ops));
        // 运营作废合同：回到「已接单、等合同」
        JsonNode back = json.readTree(exchange("/ops/supplier-orders/" + a.supplierOrderId() + "/contract",
                HttpMethod.DELETE, null, ops).getBody()).path("data");
        assertThat(back.path("status").asText()).isEqualTo("ACCEPTED");
        assertThat(back.has("contractCreatedAt")).isFalse();
        assertConflict(rawPost("/supplier/orders/" + a.supplierOrderId() + "/sign", null, a.supplier().token()),
                "dispatch.supplier_order_not_pending");

        // 重新建合同后，供应商仍可退单
        ok(rawPost("/ops/supplier-orders/" + a.supplierOrderId() + "/contract", null, ops));
        JsonNode withdrawn = post("/supplier/orders/" + a.supplierOrderId() + "/withdraw", null, a.supplier().token());
        assertThat(withdrawn.path("status").asText()).isEqualTo("CANCELLED");
        assertThat(withdrawn.path("cancelReason").asText()).isEqualTo("WITHDRAWN");
        assertThat(get("/ops/ops-orders/" + a.opsOrderId(), ops).path("status").asText()).isEqualTo("ASSEMBLING");

        // 换一张：待签时运营收回
        Accepted b = accepted("revoke-pending");
        ok(rawPost("/ops/supplier-orders/" + b.supplierOrderId() + "/contract", null, ops));
        ok(rawPost("/ops/ops-orders/" + b.opsOrderId() + "/revoke-supplier", null, ops));
        assertThat(get("/supplier/orders/" + b.supplierOrderId(), b.supplier().token()).path("cancelReason").asText())
                .isEqualTo("REVOKED");
        assertThat(get("/ops/ops-orders/" + b.opsOrderId(), ops).path("status").asText()).isEqualTo("ASSEMBLING");
    }

    @Test
    void signingNeedsAContractAndOnlyTheOwnSupplierMaySign() throws Exception {
        Accepted a = accepted("guards");
        Supplier other = supplier("other", "0.8");

        assertConflict(rawPost("/supplier/orders/" + a.supplierOrderId() + "/sign", null, a.supplier().token()),
                "dispatch.supplier_order_not_pending");
        ok(rawPost("/ops/supplier-orders/" + a.supplierOrderId() + "/contract", null, ops));
        assertConflict(rawPost("/ops/supplier-orders/" + a.supplierOrderId() + "/contract", null, ops),
                "dispatch.contract_exists");
        assertThat(rawPost("/supplier/orders/" + a.supplierOrderId() + "/sign", null, other.token())
                .getStatusCode().value()).isEqualTo(404);
        assertThat(rawPost("/ops/supplier-orders/" + a.supplierOrderId() + "/contract", null, a.supplier().token())
                .getStatusCode().value()).isEqualTo(403);
        assertThat(rawPost("/ops/supplier-orders/" + UUID.randomUUID() + "/contract", null, ops)
                .getStatusCode().value()).isEqualTo(404);
    }

    /** 7 天从接单算：到点还没签就自动取消，生产订单回组装中重派。 */
    @Test
    void unsignedOrdersTimeOutSevenDaysAfterAcceptance() throws Exception {
        Accepted stillAccepted = accepted("timeout-accepted");
        Accepted pending = accepted("timeout-pending");
        Accepted signed = accepted("timeout-signed");
        ok(rawPost("/ops/supplier-orders/" + pending.supplierOrderId() + "/contract", null, ops));
        ok(rawPost("/ops/supplier-orders/" + signed.supplierOrderId() + "/contract", null, ops));
        ok(rawPost("/supplier/orders/" + signed.supplierOrderId() + "/sign", null, signed.supplier().token()));

        // 三张都倒退 8 天
        for (Accepted a : List.of(stillAccepted, pending, signed)) {
            jdbc.update("update supplier_order set accepted_at = accepted_at - interval '8 days' where id = ?",
                    UUID.fromString(a.supplierOrderId()));
        }
        assertThat(signTimeout.runOnce()).isEqualTo(2);

        for (Accepted a : List.of(stillAccepted, pending)) {
            JsonNode so = get("/supplier/orders/" + a.supplierOrderId(), a.supplier().token());
            assertThat(so.path("status").asText()).isEqualTo("CANCELLED");
            assertThat(so.path("cancelReason").asText()).isEqualTo("SIGN_TIMEOUT");
            assertThat(get("/ops/ops-orders/" + a.opsOrderId(), ops).path("status").asText()).isEqualTo("ASSEMBLING");
        }
        assertThat(get("/supplier/orders/" + signed.supplierOrderId(), signed.supplier().token()).path("status").asText())
                .isEqualTo("CONTRACTED");
        assertThat(get("/ops/ops-orders/" + signed.opsOrderId(), ops).path("status").asText()).isEqualTo("ASSIGNED");

        // 再跑一次什么都不做；超时释放后的生产订单可以重派、重接
        assertThat(signTimeout.runOnce()).isZero();
        ok(rawPost("/ops/ops-orders/" + pending.opsOrderId() + "/publish",
                new PublishBody(LocalDate.now().plusDays(5)), ops));
        ok(rawPost("/supplier/offers/" + pending.opsOrderId() + "/accept", null, pending.supplier().token()));
    }

    @Test
    void anotherInstanceHoldingTheLockSkipsTheScan() throws Exception {
        Accepted a = accepted("locked");
        jdbc.update("update supplier_order set accepted_at = accepted_at - interval '8 days' where id = ?",
                UUID.fromString(a.supplierOrderId()));
        redis.opsForValue().set("mfg:lock:scheduler:sign-timeout:all", "someone-else");
        assertThat(signTimeout.runOnce()).isEqualTo(-1);
        assertThat(get("/supplier/orders/" + a.supplierOrderId(), a.supplier().token()).path("status").asText())
                .isEqualTo("ACCEPTED");
    }

    // ---------- 场景搭建 ----------

    private record Customer(String token, UUID orgId) {
    }

    private record Supplier(String token, String orgId) {
    }

    private record Accepted(Supplier supplier, String opsOrderId, String supplierOrderId) {
    }

    private record OrderDraftBody(String title, Integer wantedLeadDays) {
    }

    private record AddLineBody(String code, String name, int quantity, String material, String surfaceTreatment) {
    }

    private record UploadBody(String filename, String contentType) {
    }

    private record QuoteLineBody(UUID lineId, BigDecimal unitPriceCny) {
    }

    private record SendQuoteBody(String currency, Integer leadDays, List<QuoteLineBody> lines) {
    }

    private record MarkupBody(BigDecimal markupRate) {
    }

    private record DiscountBody(BigDecimal discountRate) {
    }

    private record ConfirmBody(UUID quoteId, LocalDate rateDate) {
    }

    private record InviteBody(String orgName, String email) {
    }

    private record InviteRegisterBody(String orgName, String displayName, String password) {
    }

    private record PublishBody(LocalDate supplierDueDate) {
    }

    /** 客户下单 → 报价 → 确认 → 运营组单挂市场 → 供应商接单。 */
    private Accepted accepted(String tag) throws Exception {
        Customer c = register(tag);
        String orderId = post("/customer/orders", new OrderDraftBody(null, null), c.token()).path("id").asText();
        String code = "CT-" + UUID.randomUUID().toString().substring(0, 8);
        JsonNode line = post("/customer/orders/" + orderId + "/lines",
                new AddLineBody(code, "Part " + code, 2, "AL6061", null), c.token());
        uploadPdf(c, line);
        ok(rawPost("/customer/orders/" + orderId + "/submit", null, c.token()));
        ok(exchange("/ops/customers/" + c.orgId() + "/markup", HttpMethod.PUT, new MarkupBody(BigDecimal.ONE), ops));
        ok(rawPost("/ops/customer-orders/" + orderId + "/quotes", new SendQuoteBody("EUR", 20,
                List.of(new QuoteLineBody(UUID.fromString(line.path("id").asText()), new BigDecimal("50.00")))), ops));
        JsonNode quote = get("/customer/orders/" + orderId + "/quote", c.token());
        ok(rawPost("/customer/orders/" + orderId + "/quote/confirm", new ConfirmBody(
                UUID.fromString(quote.path("id").asText()), LocalDate.parse(quote.path("rateDate").asText())),
                c.token()));

        Supplier s = supplier(tag, "0.8");
        String opsOrderId = post("/ops/ops-orders", null, ops).path("id").asText();
        ok(rawPost("/ops/dispatch/allocate", Map.of("customerOrderPartId", line.path("id").asText(),
                "parts", List.of(Map.of("opsOrderId", opsOrderId, "quantity", 2))), ops));
        ok(rawPost("/ops/ops-orders/" + opsOrderId + "/publish", new PublishBody(LocalDate.now().plusDays(10)), ops));
        String supplierOrderId = post("/supplier/offers/" + opsOrderId + "/accept", null, s.token()).path("id").asText();
        return new Accepted(s, opsOrderId, supplierOrderId);
    }

    private Supplier supplier(String tag, String discount) throws Exception {
        String email = "contract-" + tag + "-" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
        String token = post("/ops/supplier-invites", new InviteBody("Supplier " + tag, email), ops).path("token").asText();
        String orgId = post("/auth/supplier-invites/" + token + "/register",
                new InviteRegisterBody("Supplier " + tag, "Wang", "supplierpw1"), null).path("orgId").asText();
        ok(exchange("/ops/suppliers/" + orgId + "/discount", HttpMethod.PUT, new DiscountBody(new BigDecimal(discount)),
                ops));
        String access = post("/auth/login", new ExternalAuthController.ExternalLoginRequest(email, "supplierpw1"), null)
                .path("accessToken").asText();
        return new Supplier(access, orgId);
    }

    private Customer register(String tag) throws Exception {
        String email = "contract-" + tag + "-" + UUID.randomUUID() + "@example.com";
        JsonNode reg = post("/auth/register",
                new RegisterRequest(PartyType.CUSTOMER, "Acme " + tag, "DE", email, "password123", "Alice"), null);
        String token = post("/auth/login", new ExternalAuthController.ExternalLoginRequest(email, "password123"), null)
                .path("accessToken").asText();
        return new Customer(token, UUID.fromString(reg.path("orgId").asText()));
    }

    private String opsToken() throws Exception {
        String email = "contract-ops-" + UUID.randomUUID() + "@example.com";
        Organization internal = organizations.save(new Organization(Organization.Type.INTERNAL, "HQ contract", null));
        opsUsers.save(new OpsUser(internal.getId(), email, "Ops", passwordEncoder.encode("password123")));
        return post("/auth/internal/login", new OpsAuthController.OpsLoginRequest(email, "password123"), null)
                .path("accessToken").asText();
    }

    private void uploadPdf(Customer c, JsonNode line) throws Exception {
        JsonNode ticket = post("/customer/parts/" + line.path("partId").asText() + "/revisions/"
                + line.path("revision").path("id").asText() + "/files",
                new UploadBody("drawing.pdf", "application/pdf"), c.token());
        UUID fileId = UUID.fromString(ticket.path("fileId").asText());
        String key = jdbc.queryForObject("select storage_key from part_file where id = ?", String.class, fileId);
        storage.put(key, new ByteArrayInputStream(PDF), PDF.length, "application/pdf");
        ok(rawPost("/customer/files/" + fileId + "/complete", null, c.token()));
    }

    // ---------- HTTP helpers（返回 data 节点） ----------

    private void ok(ResponseEntity<String> res) {
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
    }

    private void assertConflict(ResponseEntity<String> res, String code) throws Exception {
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(409);
        assertThat(json.readTree(res.getBody()).path("message").asText()).isEqualTo(code);
    }

    private JsonNode post(String path, Object body, String bearer) throws Exception {
        ResponseEntity<String> res = rawPost(path, body, bearer);
        ok(res);
        return json.readTree(res.getBody()).path("data");
    }

    private JsonNode get(String path, String bearer) throws Exception {
        ResponseEntity<String> res = exchange(path, HttpMethod.GET, null, bearer);
        ok(res);
        return json.readTree(res.getBody()).path("data");
    }

    private ResponseEntity<String> rawPost(String path, Object body, String bearer) {
        return exchange(path, HttpMethod.POST, body, bearer);
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
