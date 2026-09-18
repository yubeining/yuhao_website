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
import java.time.LocalDate;
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
 * 组生产订单 → 派单 → 供应商接单（第 4 步 4b，2026-09-18 需求方拍板，设计文档 11 / 12 §3 §4 / 13 §2.2）。
 *
 * <p>钉死的规则：
 * <ul>
 *   <li>同一零件行可以拆给几张生产订单，一次拆完：各份之和 = 该行数量。</li>
 *   <li>运营每张生产订单二选一：定向派几家 / 挂全市场；先到先得，整单交给一家。</li>
 *   <li>定向派的几家里有人拒接只移出他；全部拒接才回组装中。</li>
 *   <li>签字前供应商可退单、运营可收回，生产订单回组装中重派。</li>
 *   <li>对供价 = 原价 × 折率（0.8 = 乘 0.8），2 位四舍五入；接单时快照。</li>
 *   <li>供应商看得到零件名称 + 图号、材料、表面处理、数量、对供单价 + 小计、交期、图纸；看不到客户身份和对客价。</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class DispatchFlowIT {

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

    // ---------- 拆行 + 定向派单 + 拒接 + 接单 ----------

    @Test
    void aLineSplitAcrossTwoOrdersIsOfferedAndTheSecondSupplierAcceptsAfterTheFirstDeclines() throws Exception {
        Confirmed order = confirmedOrder("split", new int[] {10, 5}, "100.00", "1000.00");
        Supplier s1 = supplier("s1", "0.8");
        Supplier s2 = supplier("s2", "0.9");
        Supplier s3 = supplier("s3", "0.7");
        String a = createOpsOrder();
        String b = createOpsOrder();

        allocate(order.lineIds().get(0), Map.of(a, 6, b, 4));
        allocate(order.lineIds().get(1), Map.of(a, 5));
        assertThat(poolLineIds()).doesNotContain(order.lineIds().get(0).toString(), order.lineIds().get(1).toString());

        JsonNode detail = get("/ops/ops-orders/" + a, ops);
        assertThat(detail.path("status").asText()).isEqualTo("ASSEMBLING");
        assertThat(detail.path("lines")).hasSize(2);
        assertThat(detail.path("lines").get(0).path("customerName").asText()).isEqualTo("Acme split");

        // 运营看每家的对供价：原价 × 折率
        JsonNode prices = get("/ops/ops-orders/" + a + "/supplier-prices", ops);
        JsonNode p1 = findBy(prices, "supplierOrgId", s1.orgId());
        assertThat(p1.path("total").decimalValue()).isEqualByComparingTo("4480.00");   // 80 × 6 + 800 × 5
        assertThat(findBy(prices, "supplierOrgId", s2.orgId()).path("total").decimalValue())
                .isEqualByComparingTo("5040.00");   // 90 × 6 + 900 × 5

        LocalDate due = LocalDate.now().plusDays(20);
        ok(rawPost("/ops/ops-orders/" + a + "/offer", new OfferBody(List.of(UUID.fromString(s1.orgId()),
                UUID.fromString(s2.orgId())), due), ops));
        assertThat(get("/ops/ops-orders/" + a, ops).path("status").asText()).isEqualTo("OFFERED");

        // 被派到的两家看得到，没派到的看不到
        assertThat(offerIds(s1)).contains(a);
        assertThat(offerIds(s2)).contains(a);
        assertThat(offerIds(s3)).doesNotContain(a);
        assertThat(rawGet("/supplier/offers/" + a, s3.token()).getStatusCode().value()).isEqualTo(404);

        JsonNode offer = get("/supplier/offers/" + a, s1.token());
        assertThat(offer.path("supplierDueDate").asText()).isEqualTo(due.toString());
        assertThat(offer.path("lines")).hasSize(2);
        assertThat(offer.path("lines").get(0).path("quantity").asInt()).isEqualTo(6);
        assertThat(offer.path("lines").get(0).path("files")).hasSize(1);
        JsonNode myPrices = get("/supplier/offer-prices?opsOrderIds=" + a, s1.token()).get(0);
        assertThat(myPrices.path("total").decimalValue()).isEqualByComparingTo("4480.00");
        assertThat(myPrices.path("lines").get(0).path("unitPriceCny").decimalValue()).isEqualByComparingTo("80.00");

        // 一家拒接：只移出他
        ok(rawPost("/supplier/offers/" + a + "/decline", null, s1.token()));
        assertThat(offerIds(s1)).doesNotContain(a);
        assertThat(get("/ops/ops-orders/" + a, ops).path("status").asText()).isEqualTo("OFFERED");
        assertThat(offerIds(s2)).contains(a);

        JsonNode accepted = post("/supplier/offers/" + a + "/accept", null, s2.token());
        assertThat(accepted.path("status").asText()).isEqualTo("ACCEPTED");
        assertThat(accepted.path("lines")).hasSize(2);
        assertThat(accepted.path("supplierDueDate").asText()).isEqualTo(due.toString());
        assertThat(get("/ops/ops-orders/" + a, ops).path("status").asText()).isEqualTo("ASSIGNED");
        assertThat(offerIds(s2)).doesNotContain(a);

        // 接单时快照：之后改折率、改原价都不变
        put("/ops/suppliers/" + s2.orgId() + "/discount", new DiscountBody(new BigDecimal("0.5")));
        jdbc.update("update quote_line set unit_price_cny = 1 where customer_order_part_id = ?", order.lineIds().get(0));
        JsonNode snap = findBy(get("/supplier/order-prices", s2.token()), "supplierOrderId", accepted.path("id").asText());
        assertThat(snap.path("total").decimalValue()).isEqualByComparingTo("5040.00");
        assertThat(jdbc.queryForObject("select count(*) from supplier_price_line where supplier_order_id = ?",
                Long.class, UUID.fromString(accepted.path("id").asText()))).isEqualTo(2);

        // 已被接走：别人再接 409
        assertConflict(rawPost("/supplier/offers/" + a + "/accept", null, s1.token()), "dispatch.not_open");
    }

    @Test
    void whenEveryTargetedSupplierDeclinesTheOrderReturnsToAssembling() throws Exception {
        Confirmed order = confirmedOrder("decline-all", new int[] {3}, "50.00");
        Supplier s1 = supplier("d1", "0.8");
        Supplier s2 = supplier("d2", "0.8");
        String a = createOpsOrder();
        allocate(order.lineIds().get(0), Map.of(a, 3));
        ok(rawPost("/ops/ops-orders/" + a + "/offer", new OfferBody(List.of(UUID.fromString(s1.orgId()),
                UUID.fromString(s2.orgId())), LocalDate.now().plusDays(10)), ops));
        ok(rawPost("/supplier/offers/" + a + "/decline", null, s1.token()));
        assertThat(get("/ops/ops-orders/" + a, ops).path("status").asText()).isEqualTo("OFFERED");
        ok(rawPost("/supplier/offers/" + a + "/decline", null, s2.token()));
        JsonNode back = get("/ops/ops-orders/" + a, ops);
        assertThat(back.path("status").asText()).isEqualTo("ASSEMBLING");
        assertThat(back.path("offers")).hasSize(2);

        // 下一轮可以再派给同一家
        ok(rawPost("/ops/ops-orders/" + a + "/offer", new OfferBody(List.of(UUID.fromString(s1.orgId())),
                LocalDate.now().plusDays(10)), ops));
        assertThat(offerIds(s1)).contains(a);
    }

    // ---------- 挂全市场 ----------

    @Test
    void aMarketOrderIsVisibleToEveryDispatchableSupplierAndTheFirstAcceptWins() throws Exception {
        Confirmed order = confirmedOrder("market", new int[] {4}, "25.00");
        Supplier s1 = supplier("m1", "0.8");
        Supplier s2 = supplier("m2", "0.9");
        Supplier noDiscount = supplier("m3", null);
        String a = createOpsOrder();
        allocate(order.lineIds().get(0), Map.of(a, 4));
        ok(rawPost("/ops/ops-orders/" + a + "/publish", new PublishBody(LocalDate.now().plusDays(15)), ops));
        assertThat(get("/ops/ops-orders/" + a, ops).path("status").asText()).isEqualTo("PUBLISHED");

        assertThat(offerIds(s1)).contains(a);
        assertThat(offerIds(s2)).contains(a);
        assertThat(offerIds(noDiscount)).doesNotContain(a);
        assertThat(rawPost("/supplier/offers/" + a + "/accept", null, noDiscount.token()).getStatusCode().value())
                .isEqualTo(404);
        assertConflict(rawPost("/supplier/offers/" + a + "/decline", null, s1.token()), "dispatch.not_targeted");

        // 各家看到各自的价
        assertThat(get("/supplier/offer-prices?opsOrderIds=" + a, s1.token()).get(0).path("total").decimalValue())
                .isEqualByComparingTo("80.00");   // 20 × 4
        assertThat(get("/supplier/offer-prices?opsOrderIds=" + a, s2.token()).get(0).path("total").decimalValue())
                .isEqualByComparingTo("90.00");   // 22.50 × 4

        ok(rawPost("/supplier/offers/" + a + "/accept", null, s2.token()));
        assertThat(offerIds(s1)).doesNotContain(a);
        assertConflict(rawPost("/supplier/offers/" + a + "/accept", null, s1.token()), "dispatch.not_open");
    }

    // ---------- 签字前双方可退 ----------

    @Test
    void theSupplierCanWithdrawAndTheOperatorCanRevokeBeforeSigning() throws Exception {
        Confirmed order = confirmedOrder("withdraw", new int[] {2}, "10.00");
        Supplier s1 = supplier("w1", "1");
        String a = createOpsOrder();
        allocate(order.lineIds().get(0), Map.of(a, 2));
        ok(rawPost("/ops/ops-orders/" + a + "/publish", new PublishBody(LocalDate.now().plusDays(5)), ops));
        String so1 = post("/supplier/offers/" + a + "/accept", null, s1.token()).path("id").asText();

        JsonNode withdrawn = post("/supplier/orders/" + so1 + "/withdraw", null, s1.token());
        assertThat(withdrawn.path("status").asText()).isEqualTo("CANCELLED");
        assertThat(withdrawn.path("cancelReason").asText()).isEqualTo("WITHDRAWN");
        assertThat(get("/ops/ops-orders/" + a, ops).path("status").asText()).isEqualTo("ASSEMBLING");
        assertConflict(rawPost("/supplier/orders/" + so1 + "/withdraw", null, s1.token()), "dispatch.supplier_order_not_active");

        ok(rawPost("/ops/ops-orders/" + a + "/publish", new PublishBody(LocalDate.now().plusDays(5)), ops));
        String so2 = post("/supplier/offers/" + a + "/accept", null, s1.token()).path("id").asText();
        assertThat(so2).isNotEqualTo(so1);
        ok(rawPost("/ops/ops-orders/" + a + "/revoke-supplier", null, ops));
        JsonNode revoked = get("/supplier/orders/" + so2, s1.token());
        assertThat(revoked.path("status").asText()).isEqualTo("CANCELLED");
        assertThat(revoked.path("cancelReason").asText()).isEqualTo("REVOKED");
        JsonNode detail = get("/ops/ops-orders/" + a, ops);
        assertThat(detail.path("status").asText()).isEqualTo("ASSEMBLING");
        assertThat(detail.path("supplierOrders")).hasSize(2);
    }

    @Test
    void recallingAnOfferHidesItAgain() throws Exception {
        Confirmed order = confirmedOrder("recall", new int[] {1}, "10.00");
        Supplier s1 = supplier("r1", "0.8");
        String a = createOpsOrder();
        allocate(order.lineIds().get(0), Map.of(a, 1));
        ok(rawPost("/ops/ops-orders/" + a + "/offer", new OfferBody(List.of(UUID.fromString(s1.orgId())),
                LocalDate.now().plusDays(3)), ops));
        ok(rawPost("/ops/ops-orders/" + a + "/recall", null, ops));
        assertThat(get("/ops/ops-orders/" + a, ops).path("status").asText()).isEqualTo("ASSEMBLING");
        assertThat(offerIds(s1)).doesNotContain(a);
        assertThat(rawGet("/supplier/offers/" + a, s1.token()).getStatusCode().value()).isEqualTo(404);
        // 这一轮派给过他、现在收回了：接单 409（不是 404 —— 他确实看到过这张单）
        assertConflict(rawPost("/supplier/offers/" + a + "/accept", null, s1.token()), "dispatch.not_open");
        assertConflict(rawPost("/ops/ops-orders/" + a + "/recall", null, ops), "dispatch.not_open");
    }

    // ---------- 拆行规则 ----------

    @Test
    void allocationMustSplitTheWholeLineAtOnce() throws Exception {
        Confirmed order = confirmedOrder("alloc", new int[] {10}, "10.00");
        String a = createOpsOrder();
        String b = createOpsOrder();
        String line = order.lineIds().get(0).toString();

        assertBad(rawPost("/ops/dispatch/allocate", allocation(line, Map.of(a, 6)), ops), "dispatch.quantity_mismatch");
        assertBad(rawPost("/ops/dispatch/allocate", allocation(line, Map.of(a, 6, b, 5)), ops), "dispatch.quantity_mismatch");
        assertThat(rawPost("/ops/dispatch/allocate", Map.of("customerOrderPartId", line,
                "parts", List.of(Map.of("opsOrderId", a, "quantity", 5), Map.of("opsOrderId", a, "quantity", 5))), ops)
                .getStatusCode().value()).isEqualTo(400);
        assertThat(rawPost("/ops/dispatch/allocate", Map.of("customerOrderPartId", line,
                "parts", List.of(Map.of("opsOrderId", a, "quantity", 0), Map.of("opsOrderId", b, "quantity", 10))), ops)
                .getStatusCode().value()).isEqualTo(400);
        assertThat(rawPost("/ops/dispatch/allocate", allocation(UUID.randomUUID().toString(), Map.of(a, 10)), ops)
                .getStatusCode().value()).isEqualTo(404);

        allocate(order.lineIds().get(0), Map.of(a, 7, b, 3));
        assertConflict(rawPost("/ops/dispatch/allocate", allocation(line, Map.of(a, 10)), ops), "dispatch.line_allocated");

        // 撤回分配：整行所有份一起撤
        ok(rawPost("/ops/dispatch/unallocate", Map.of("customerOrderPartId", line), ops));
        assertThat(poolLineIds()).contains(line);
        assertThat(get("/ops/ops-orders/" + a, ops).path("lines")).isEmpty();
        assertThat(get("/ops/ops-orders/" + b, ops).path("lines")).isEmpty();

        // 其中一张已经派出去了就撤不了
        allocate(order.lineIds().get(0), Map.of(a, 7, b, 3));
        ok(rawPost("/ops/ops-orders/" + b + "/publish", new PublishBody(LocalDate.now().plusDays(5)), ops));
        assertConflict(rawPost("/ops/dispatch/unallocate", Map.of("customerOrderPartId", line), ops),
                "dispatch.ops_order_not_assembling");
        // 往已派出去的单里分配也不行
        Confirmed other = confirmedOrder("alloc2", new int[] {1}, "10.00");
        assertConflict(rawPost("/ops/dispatch/allocate", allocation(other.lineIds().get(0).toString(), Map.of(b, 1)), ops),
                "dispatch.ops_order_not_assembling");
    }

    @Test
    void onlyConfirmedOrdersEnterThePoolAndEmptyOrdersCannotBeDispatched() throws Exception {
        Customer c = register("unconfirmed");
        SubmittedOrder quoted = submittedOrder(c, 2);
        setMarkup(c.orgId(), "1");
        sendQuote(quoted, "10.00");
        assertThat(poolLineIds()).doesNotContain(quoted.lineIds().get(0).toString());
        String a = createOpsOrder();
        assertConflict(rawPost("/ops/dispatch/allocate", allocation(quoted.lineIds().get(0).toString(), Map.of(a, 2)), ops),
                "dispatch.order_not_confirmed");

        assertConflict(rawPost("/ops/ops-orders/" + a + "/publish", new PublishBody(LocalDate.now().plusDays(5)), ops),
                "dispatch.ops_order_empty");
        ok(exchange("/ops/ops-orders/" + a, HttpMethod.DELETE, null, ops));
        assertThat(rawGet("/ops/ops-orders/" + a, ops).getStatusCode().value()).isEqualTo(404);

        Confirmed order = confirmedOrder("nonempty", new int[] {1}, "10.00");
        String b = createOpsOrder();
        allocate(order.lineIds().get(0), Map.of(b, 1));
        assertConflict(exchange("/ops/ops-orders/" + b, HttpMethod.DELETE, null, ops), "dispatch.ops_order_not_empty");

        // 派单参数：至少一家、都得可派单、交期不能是过去
        Supplier noDiscount = supplier("nd", null);
        assertConflict(rawPost("/ops/ops-orders/" + b + "/offer", new OfferBody(List.of(UUID.fromString(noDiscount.orgId())),
                LocalDate.now().plusDays(5)), ops), "dispatch.supplier_not_dispatchable");
        assertThat(rawPost("/ops/ops-orders/" + b + "/offer", new OfferBody(List.of(), LocalDate.now().plusDays(5)), ops)
                .getStatusCode().value()).isEqualTo(400);
        assertThat(rawPost("/ops/ops-orders/" + b + "/publish", new PublishBody(LocalDate.now().minusDays(1)), ops)
                .getStatusCode().value()).isEqualTo(400);
    }

    // ---------- 隐私 / 看图 / 越权 ----------

    @Test
    void suppliersNeverSeeTheCustomerOrTheCustomerPrice() throws Exception {
        Confirmed order = confirmedOrder("privacy", new int[] {2}, "123.45");
        Supplier s1 = supplier("p1", "0.8");
        String a = createOpsOrder();
        allocate(order.lineIds().get(0), Map.of(a, 2));
        ok(rawPost("/ops/ops-orders/" + a + "/offer", new OfferBody(List.of(UUID.fromString(s1.orgId())),
                LocalDate.now().plusDays(5)), ops));

        List<String> bodies = new ArrayList<>();
        bodies.add(rawGet("/supplier/offers", s1.token()).getBody());
        bodies.add(rawGet("/supplier/offers/" + a, s1.token()).getBody());
        bodies.add(rawGet("/supplier/offer-prices?opsOrderIds=" + a, s1.token()).getBody());
        String soId = post("/supplier/offers/" + a + "/accept", null, s1.token()).path("id").asText();
        bodies.add(rawGet("/supplier/orders", s1.token()).getBody());
        bodies.add(rawGet("/supplier/orders/" + soId, s1.token()).getBody());
        bodies.add(rawGet("/supplier/order-prices", s1.token()).getBody());
        String customerPrice = jdbc.queryForObject("select unit_price::text from quote_line where customer_order_part_id = ?",
                String.class, order.lineIds().get(0));
        for (String body : bodies) {
            assertThat(body).doesNotContain(order.customer().orgId().toString(), "Acme privacy", order.id(),
                    "customerOrg", "customerName", "customerOrderId", "123.45", customerPrice, "discount", "baseUnitPrice");
        }
    }

    @Test
    void offeredSuppliersCanViewDrawingsAndEveryViewIsAudited() throws Exception {
        Confirmed order = confirmedOrder("drawing", new int[] {2}, "10.00");
        Supplier s1 = supplier("v1", "0.8");
        Supplier s2 = supplier("v2", "0.8");
        String a = createOpsOrder();
        allocate(order.lineIds().get(0), Map.of(a, 2));
        ok(rawPost("/ops/ops-orders/" + a + "/offer", new OfferBody(List.of(UUID.fromString(s1.orgId())),
                LocalDate.now().plusDays(5)), ops));
        JsonNode line = get("/supplier/offers/" + a, s1.token()).path("lines").get(0);
        String fileId = line.path("files").get(0).path("id").asText();
        String offerUrl = "/supplier/offers/" + a + "/lines/" + line.path("id").asText() + "/files/" + fileId + "/view-url";

        ok(rawGet(offerUrl, s1.token()));
        Map<String, Object> log = lastAccess(fileId);
        assertThat(log.get("accessor_party_type")).isEqualTo("SUPPLIER");
        assertThat(log.get("accessor_org_id")).isEqualTo(UUID.fromString(s1.orgId()));
        assertThat(log.get("context_type")).isEqualTo("OPS_ORDER");
        assertThat(log.get("context_id")).isEqualTo(UUID.fromString(a));

        long before = jdbc.queryForObject("select count(*) from part_file_access_log", Long.class);
        assertThat(rawGet(offerUrl, s2.token()).getStatusCode().value()).isEqualTo(404);
        Confirmed other = confirmedOrder("drawing2", new int[] {1}, "10.00");
        assertThat(rawGet("/supplier/offers/" + a + "/lines/" + line.path("id").asText() + "/files/"
                + other.fileIds().get(0) + "/view-url", s1.token()).getStatusCode().value()).isEqualTo(404);
        assertThat(jdbc.queryForObject("select count(*) from part_file_access_log", Long.class)).isEqualTo(before);

        JsonNode so = post("/supplier/offers/" + a + "/accept", null, s1.token());
        String soLine = so.path("lines").get(0).path("id").asText();
        ok(rawGet("/supplier/orders/" + so.path("id").asText() + "/lines/" + soLine + "/files/" + fileId + "/view-url",
                s1.token()));
        assertThat(lastAccess(fileId).get("context_type")).isEqualTo("SUPPLIER_ORDER");
        assertThat(rawGet("/supplier/orders/" + so.path("id").asText() + "/lines/" + soLine + "/files/" + fileId
                + "/view-url", s2.token()).getStatusCode().value()).isEqualTo(404);
    }

    @Test
    void eachAudienceStaysInItsOwnPortal() throws Exception {
        Confirmed order = confirmedOrder("portal", new int[] {1}, "10.00");
        Supplier s1 = supplier("g1", "0.8");
        Supplier s2 = supplier("g2", "0.8");
        String a = createOpsOrder();
        allocate(order.lineIds().get(0), Map.of(a, 1));
        ok(rawPost("/ops/ops-orders/" + a + "/publish", new PublishBody(LocalDate.now().plusDays(5)), ops));
        String so = post("/supplier/offers/" + a + "/accept", null, s1.token()).path("id").asText();

        assertThat(rawGet("/ops/dispatch/pool", order.customer().token()).getStatusCode().value()).isEqualTo(403);
        assertThat(rawGet("/ops/ops-orders", s1.token()).getStatusCode().value()).isEqualTo(403);
        assertThat(rawGet("/supplier/offers", ops).getStatusCode().value()).isEqualTo(403);
        assertThat(rawGet("/supplier/offers", order.customer().token()).getStatusCode().value()).isEqualTo(403);
        assertThat(rawGet("/supplier/orders/" + so, s2.token()).getStatusCode().value()).isEqualTo(404);
        assertThat(rawPost("/supplier/orders/" + so + "/withdraw", null, s2.token()).getStatusCode().value()).isEqualTo(404);
        assertThat(findBy(get("/supplier/order-prices", s2.token()), "supplierOrderId", so)).isNull();
    }

    /** 价格快照写不进去（比如这一行找不到客户确认的原价）时，接单整体回滚。 */
    @Test
    void acceptingRollsBackWhenThePriceSnapshotCannotBeTaken() throws Exception {
        Confirmed order = confirmedOrder("rollback", new int[] {1}, "10.00");
        Supplier s1 = supplier("rb", "0.8");
        String a = createOpsOrder();
        allocate(order.lineIds().get(0), Map.of(a, 1));
        ok(rawPost("/ops/ops-orders/" + a + "/publish", new PublishBody(LocalDate.now().plusDays(5)), ops));
        jdbc.update("update quote_line set customer_order_part_id = ? where customer_order_part_id = ?",
                UUID.randomUUID(), order.lineIds().get(0));

        assertConflict(rawPost("/supplier/offers/" + a + "/accept", null, s1.token()), "dispatch.base_price_missing");
        assertThat(get("/ops/ops-orders/" + a, ops).path("status").asText()).isEqualTo("PUBLISHED");
        assertThat(jdbc.queryForObject("select count(*) from supplier_order where ops_order_id = ?", Long.class,
                UUID.fromString(a))).isZero();
    }

    // ---------- 并发 ----------

    @Test
    void twoSuppliersAcceptingTheSameOrderAtOnceNeverBothWin() throws Exception {
        Supplier s1 = supplier("race1", "0.8");
        Supplier s2 = supplier("race2", "0.9");
        Confirmed order = confirmedOrder("race", new int[30], "10.00");
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int round = 0; round < 30; round++) {
                String a = createOpsOrder();
                allocate(order.lineIds().get(round), Map.of(a, 1));
                ok(rawPost("/ops/ops-orders/" + a + "/publish", new PublishBody(LocalDate.now().plusDays(5)), ops));
                CyclicBarrier go = new CyclicBarrier(2);
                Future<ResponseEntity<String>> r1 = pool.submit(() -> {
                    go.await();
                    return rawPost("/supplier/offers/" + a + "/accept", null, s1.token());
                });
                Future<ResponseEntity<String>> r2 = pool.submit(() -> {
                    go.await();
                    return rawPost("/supplier/offers/" + a + "/accept", null, s2.token());
                });
                assertThat(List.of(r1.get().getStatusCode().value(), r2.get().getStatusCode().value()))
                        .as("round %d", round).containsExactlyInAnyOrder(200, 409);
                assertThat(jdbc.queryForObject("select count(*) from supplier_order where ops_order_id = ?",
                        Long.class, UUID.fromString(a))).as("round %d", round).isEqualTo(1);
            }
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void allocatingTheSameLineTwiceAtOnceOnlyWorksOnce() throws Exception {
        Confirmed order = confirmedOrder("race-alloc", new int[30], "10.00");
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int round = 0; round < 30; round++) {
                String a = createOpsOrder();
                String b = createOpsOrder();
                String line = order.lineIds().get(round).toString();
                CyclicBarrier go = new CyclicBarrier(2);
                Future<ResponseEntity<String>> r1 = pool.submit(() -> {
                    go.await();
                    return rawPost("/ops/dispatch/allocate", allocation(line, Map.of(a, 1)), ops);
                });
                Future<ResponseEntity<String>> r2 = pool.submit(() -> {
                    go.await();
                    return rawPost("/ops/dispatch/allocate", allocation(line, Map.of(b, 1)), ops);
                });
                assertThat(List.of(r1.get().getStatusCode().value(), r2.get().getStatusCode().value()))
                        .as("round %d", round).containsExactlyInAnyOrder(200, 409);
                assertThat(jdbc.queryForObject("select count(*) from ops_order_part where upstream_part_id = ?",
                        Long.class, UUID.fromString(line))).as("round %d", round).isEqualTo(1);
            }
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void acceptingWhileTheOperatorRecallsNeverLeavesBothDone() throws Exception {
        Supplier s1 = supplier("race-recall", "0.8");
        Confirmed order = confirmedOrder("race-recall", new int[30], "10.00");
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int round = 0; round < 30; round++) {
                String a = createOpsOrder();
                allocate(order.lineIds().get(round), Map.of(a, 1));
                ok(rawPost("/ops/ops-orders/" + a + "/publish", new PublishBody(LocalDate.now().plusDays(5)), ops));
                CyclicBarrier go = new CyclicBarrier(2);
                Future<ResponseEntity<String>> accept = pool.submit(() -> {
                    go.await();
                    return rawPost("/supplier/offers/" + a + "/accept", null, s1.token());
                });
                Future<ResponseEntity<String>> recall = pool.submit(() -> {
                    go.await();
                    return rawPost("/ops/ops-orders/" + a + "/recall", null, ops);
                });
                int ac = accept.get().getStatusCode().value();
                int rc = recall.get().getStatusCode().value();
                assertThat(List.of(ac, rc)).as("round %d", round).containsExactlyInAnyOrder(200, 409);
                String status = get("/ops/ops-orders/" + a, ops).path("status").asText();
                assertThat(status).as("round %d", round).isEqualTo(ac == 200 ? "ASSIGNED" : "ASSEMBLING");
            }
        } finally {
            pool.shutdownNow();
        }
    }

    // ---------- 场景搭建 ----------

    private record Customer(String token, UUID orgId) {
    }

    private record SubmittedOrder(String id, List<UUID> lineIds, List<UUID> fileIds) {
    }

    private record Confirmed(Customer customer, String id, List<UUID> lineIds, List<UUID> fileIds) {
    }

    private record Supplier(String token, String orgId) {
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

    private record OfferBody(List<UUID> supplierOrgIds, LocalDate supplierDueDate) {
    }

    private record PublishBody(LocalDate supplierDueDate) {
    }

    private static Map<String, Object> allocation(String lineId, Map<String, Integer> parts) {
        List<Map<String, Object>> list = new ArrayList<>();
        parts.forEach((opsOrderId, qty) -> list.add(Map.of("opsOrderId", opsOrderId, "quantity", qty)));
        return Map.of("customerOrderPartId", lineId, "parts", list);
    }

    private void allocate(UUID lineId, Map<String, Integer> parts) throws Exception {
        ok(rawPost("/ops/dispatch/allocate", allocation(lineId.toString(), parts), ops));
    }

    private String createOpsOrder() throws Exception {
        return post("/ops/ops-orders", null, ops).path("id").asText();
    }

    private List<String> poolLineIds() throws Exception {
        List<String> ids = new ArrayList<>();
        get("/ops/dispatch/pool", ops).forEach(n -> ids.add(n.path("customerOrderPartId").asText()));
        return ids;
    }

    private List<String> offerIds(Supplier s) throws Exception {
        List<String> ids = new ArrayList<>();
        get("/supplier/offers", s.token()).forEach(n -> ids.add(n.path("id").asText()));
        return ids;
    }

    private Map<String, Object> lastAccess(String fileId) {
        return jdbc.queryForMap("select * from part_file_access_log where part_file_id = ? order by id desc limit 1",
                UUID.fromString(fileId));
    }

    /** 客户下单（每个数量一行，每行一份 PDF）→ 运营按原价报价（加成率 1）→ 客户确认。数量为 0 的当 1。 */
    private Confirmed confirmedOrder(String tag, int[] quantities, String... unitPricesCny) throws Exception {
        Customer c = register(tag);
        int[] qs = quantities.clone();
        for (int i = 0; i < qs.length; i++) {
            qs[i] = Math.max(1, qs[i]);
        }
        SubmittedOrder o = submittedOrder(c, qs);
        setMarkup(c.orgId(), "1");
        String[] prices = new String[qs.length];
        for (int i = 0; i < qs.length; i++) {
            prices[i] = unitPricesCny[Math.min(i, unitPricesCny.length - 1)];
        }
        sendQuote(o, prices);
        JsonNode q = get("/customer/orders/" + o.id() + "/quote", c.token());
        ok(rawPost("/customer/orders/" + o.id() + "/quote/confirm",
                new ConfirmBody(UUID.fromString(q.path("id").asText()), LocalDate.parse(q.path("rateDate").asText())),
                c.token()));
        return new Confirmed(c, o.id(), o.lineIds(), o.fileIds());
    }

    private void setMarkup(UUID orgId, String rate) throws Exception {
        ok(exchange("/ops/customers/" + orgId + "/markup", HttpMethod.PUT, new MarkupBody(new BigDecimal(rate)), ops));
    }

    private void sendQuote(SubmittedOrder o, String... unitPricesCny) throws Exception {
        List<QuoteLineBody> lines = new ArrayList<>();
        for (int i = 0; i < o.lineIds().size(); i++) {
            lines.add(new QuoteLineBody(o.lineIds().get(i), new BigDecimal(unitPricesCny[i])));
        }
        ok(rawPost("/ops/customer-orders/" + o.id() + "/quotes", new SendQuoteBody("EUR", 20, lines), ops));
    }

    private Supplier supplier(String tag, String discount) throws Exception {
        String email = "dispatch-" + tag + "-" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
        String token = post("/ops/supplier-invites", new InviteBody("Supplier " + tag, email), ops).path("token").asText();
        String orgId = post("/auth/supplier-invites/" + token + "/register",
                new InviteRegisterBody("Supplier " + tag, "Wang", "supplierpw1"), null).path("orgId").asText();
        if (discount != null) {
            put("/ops/suppliers/" + orgId + "/discount", new DiscountBody(new BigDecimal(discount)));
        }
        String access = json.readTree(rawPost("/auth/login",
                new ExternalAuthController.ExternalLoginRequest(email, "supplierpw1"), null).getBody())
                .path("data").path("accessToken").asText();
        return new Supplier(access, orgId);
    }

    private Customer register(String tag) throws Exception {
        String email = "dispatch-" + tag + "-" + UUID.randomUUID() + "@example.com";
        JsonNode reg = json.readTree(rawPost("/auth/register",
                new RegisterRequest(PartyType.CUSTOMER, "Acme " + tag, "DE", email, "password123", "Alice"), null).getBody());
        String token = json.readTree(rawPost("/auth/login",
                new ExternalAuthController.ExternalLoginRequest(email, "password123"), null).getBody())
                .path("data").path("accessToken").asText();
        return new Customer(token, UUID.fromString(reg.path("data").path("orgId").asText()));
    }

    private String opsToken() throws Exception {
        String email = "dispatch-ops-" + UUID.randomUUID() + "@example.com";
        Organization internal = organizations.save(new Organization(Organization.Type.INTERNAL, "HQ dispatch", null));
        opsUsers.save(new OpsUser(internal.getId(), email, "Ops", passwordEncoder.encode("password123")));
        return json.readTree(rawPost("/auth/internal/login", new OpsAuthController.OpsLoginRequest(email, "password123"),
                null).getBody()).path("data").path("accessToken").asText();
    }

    private SubmittedOrder submittedOrder(Customer c, int... quantities) throws Exception {
        String orderId = post("/customer/orders", new OrderDraftBody(null, null), c.token()).path("id").asText();
        List<UUID> lineIds = new ArrayList<>();
        List<UUID> fileIds = new ArrayList<>();
        for (int q : quantities) {
            String code = "DP-" + UUID.randomUUID().toString().substring(0, 8);
            JsonNode line = post("/customer/orders/" + orderId + "/lines",
                    new AddLineBody(code, "Part " + code, q, "AL6061", "Anodized"), c.token());
            lineIds.add(UUID.fromString(line.path("id").asText()));
            fileIds.add(uploadPdf(c, line));
        }
        ok(rawPost("/customer/orders/" + orderId + "/submit", null, c.token()));
        return new SubmittedOrder(orderId, lineIds, fileIds);
    }

    private UUID uploadPdf(Customer c, JsonNode line) throws Exception {
        JsonNode ticket = post("/customer/parts/" + line.path("partId").asText() + "/revisions/"
                + line.path("revision").path("id").asText() + "/files", new UploadBody("drawing.pdf", "application/pdf"),
                c.token());
        UUID fileId = UUID.fromString(ticket.path("fileId").asText());
        String key = jdbc.queryForObject("select storage_key from part_file where id = ?", String.class, fileId);
        storage.put(key, new ByteArrayInputStream(PDF), PDF.length, "application/pdf");
        ok(rawPost("/customer/files/" + fileId + "/complete", null, c.token()));
        return fileId;
    }

    // ---------- HTTP helpers（返回 data 节点） ----------

    private static JsonNode findBy(JsonNode items, String field, String value) {
        for (JsonNode n : items) {
            if (n.path(field).asText().equals(value)) {
                return n;
            }
        }
        return null;
    }

    private void ok(ResponseEntity<String> res) {
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
    }

    private void assertConflict(ResponseEntity<String> res, String code) throws Exception {
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(409);
        assertThat(json.readTree(res.getBody()).path("message").asText()).isEqualTo(code);
    }

    private void assertBad(ResponseEntity<String> res, String code) throws Exception {
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(400);
        assertThat(json.readTree(res.getBody()).path("message").asText()).isEqualTo(code);
    }

    private JsonNode post(String path, Object body, String bearer) throws Exception {
        ResponseEntity<String> res = rawPost(path, body, bearer);
        ok(res);
        return json.readTree(res.getBody()).path("data");
    }

    private JsonNode put(String path, Object body) throws Exception {
        ResponseEntity<String> res = exchange(path, HttpMethod.PUT, body, ops);
        ok(res);
        return json.readTree(res.getBody()).path("data");
    }

    private JsonNode get(String path, String bearer) throws Exception {
        ResponseEntity<String> res = rawGet(path, bearer);
        ok(res);
        return json.readTree(res.getBody()).path("data");
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
}
