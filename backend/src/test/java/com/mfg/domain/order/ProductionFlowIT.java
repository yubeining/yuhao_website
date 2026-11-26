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
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 生产进度 + 质检（2026-09-20 需求方拍板，设计文档 12 §1 §5 §7 §8）。
 *
 * <p>钉死的规则：
 * <ul>
 *   <li>报工只有<b>开工 / 完工</b>两个动作，不报件数；<b>整单全部完工才能发给平台</b>。</li>
 *   <li>质检按件数记：合格 N / 返工 M / 报废 K，三个数之和必须等于该行件数。</li>
 *   <li>部分返工 / 部分报废 = 拆行：原行留合格件，问题件另开一行，溯源两头都记。</li>
 *   <li>报废补料本轮只做<b>原厂重做</b>（同一家、不加钱）。</li>
 *   <li><b>数量守恒</b>：活跃件数 + 还没补料的报废件数 = 客户要的件数，每一步之后都成立。</li>
 *   <li>客户只看得到 待安排 / 进行中 / 已完成，看不到返工、报废、供应商。</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class ProductionFlowIT {

    /** 最小的合法 PNG 文件头（8 字节签名 + IHDR 块开头），tika 按它判成 image/png。 */
    private static final byte[] PNG = new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n',
            0, 0, 0, 0x0D, 'I', 'H', 'D', 'R', 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0};
    private static final byte[] PDF =
            "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n".getBytes(StandardCharsets.US_ASCII);
    private static final LocalDate RATE_DAY = LocalDate.of(2026, 9, 16);
    /** 供应商发给平台时必填承运商 + 运单号（2026-11-24 拍板）。 */
    private static final Object SHIP = new ShipBody("SF Express", "SF0000000001");

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

    /** 开工 → 完工 → 发货 → 全部合格：一路顶到客户订单待发货。 */
    @Test
    void theOrderRunsFromStartToQcPassed() throws Exception {
        Signed s = signed("happy", 5);
        String line = lineId(s);

        JsonNode started = post(supplierLine(s, line) + "/start", null, s.supplier().token());
        assertThat(started.path("status").asText()).isEqualTo("IN_PRODUCTION");
        assertThat(lineOf(started, line).path("status").asText()).isEqualTo("IN_PRODUCTION");
        assertThat(customerLine(s).path("fulfillmentStatus").asText()).isEqualTo("IN_PROGRESS");

        JsonNode produced = post(supplierLine(s, line) + "/produced", null, s.supplier().token());
        assertThat(lineOf(produced, line).path("status").asText()).isEqualTo("PRODUCED");
        assertThat(produced.path("status").asText()).isEqualTo("IN_PRODUCTION");

        JsonNode shipped = post("/supplier/orders/" + s.supplierOrderId() + "/ship", SHIP, s.supplier().token());
        assertThat(shipped.path("status").asText()).isEqualTo("SHIPPED");
        assertThat(lineOf(shipped, line).path("status").asText()).isEqualTo("QC_PENDING");
        assertThat(customerOrder(s).path("status").asText()).isEqualTo("CONFIRMED");

        JsonNode qc = post(opsLine(s, line) + "/qc", new QcBody(5, 0, 0), ops);
        assertThat(qc.path("status").asText()).isEqualTo("FULFILLED");
        assertThat(opsLineOf(qc, line).path("status").asText()).isEqualTo("QC_PASSED");
        assertThat(get("/ops/ops-orders/" + s.opsOrderId(), ops).path("status").asText()).isEqualTo("FULFILLED");
        assertThat(customerOrder(s).path("status").asText()).isEqualTo("READY");
        assertThat(customerLine(s).path("fulfillmentStatus").asText()).isEqualTo("FULFILLED");
        assertConserved(s, 5);
    }

    /** 部分合格 + 部分返工 + 部分报废 → 原厂重做 → 全部合格。每一步之后数量都得守恒。 */
    @Test
    void partialReworkAndScrapSplitTheLineAndStayConserved() throws Exception {
        Signed s = signed("split", 5);
        String line = lineId(s);
        shipAll(s);

        JsonNode qc = post(opsLine(s, line) + "/qc", new QcBody(2, 2, 1), ops);
        assertThat(qc.path("status").asText()).isEqualTo("IN_PRODUCTION");
        assertConserved(s, 5);

        JsonNode passed = opsLineOf(qc, line);
        assertThat(passed.path("status").asText()).isEqualTo("QC_PASSED");
        assertThat(passed.path("quantity").asInt()).isEqualTo(2);

        List<JsonNode> children = childrenOf(qc, line);
        assertThat(children).hasSize(2);
        JsonNode rework = children.stream().filter(n -> n.path("status").asText().equals("PENDING")).findFirst()
                .orElseThrow();
        JsonNode scrap = children.stream().filter(n -> n.path("status").asText().equals("SCRAPPED")).findFirst()
                .orElseThrow();
        assertThat(rework.path("quantity").asInt()).isEqualTo(2);
        assertThat(scrap.path("quantity").asInt()).isEqualTo(1);

        // 客户这一步只看得到「进行中」，看不到返工 / 报废
        assertThat(customerLine(s).path("fulfillmentStatus").asText()).isEqualTo("IN_PROGRESS");
        assertThat(customerOrder(s).path("status").asText()).isEqualTo("CONFIRMED");

        // 报废件原厂重做：旧行接上溯源，新行从头再走
        JsonNode remade = post(opsLine(s, scrap.path("id").asText()) + "/remake", null, ops);
        assertThat(opsLineOf(remade, scrap.path("id").asText()).path("supersededBy").asText()).isNotEmpty();
        JsonNode remakeLine = childrenOf(remade, scrap.path("id").asText()).get(0);
        assertThat(remakeLine.path("status").asText()).isEqualTo("PENDING");
        assertThat(remakeLine.path("quantity").asInt()).isEqualTo(1);
        assertConserved(s, 5);

        // 两条新行做完再发一次，质检全过 → 整单完成
        for (String id : List.of(rework.path("id").asText(), remakeLine.path("id").asText())) {
            ok(rawPost(supplierLine(s, id) + "/start", null, s.supplier().token()));
            ok(rawPost(supplierLine(s, id) + "/produced", null, s.supplier().token()));
        }
        assertThat(post("/supplier/orders/" + s.supplierOrderId() + "/ship", SHIP, s.supplier().token())
                .path("status").asText()).isEqualTo("SHIPPED");
        ok(rawPost(opsLine(s, rework.path("id").asText()) + "/qc", new QcBody(2, 0, 0), ops));
        JsonNode done = post(opsLine(s, remakeLine.path("id").asText()) + "/qc", new QcBody(1, 0, 0), ops);
        assertThat(done.path("status").asText()).isEqualTo("FULFILLED");
        assertThat(customerOrder(s).path("status").asText()).isEqualTo("READY");
        assertConserved(s, 5);
    }

    /** 全部返工：原行件数不动（库里 quantity >= 1），状态改成「已被替代」。 */
    @Test
    void aFullyReworkedLineIsSuperseded() throws Exception {
        Signed s = signed("full-rework", 3);
        String line = lineId(s);
        shipAll(s);

        JsonNode qc = post(opsLine(s, line) + "/qc", new QcBody(0, 3, 0), ops);
        JsonNode old = opsLineOf(qc, line);
        assertThat(old.path("status").asText()).isEqualTo("SUPERSEDED");
        assertThat(old.path("quantity").asInt()).isEqualTo(3);
        assertThat(old.path("supersededBy").asText()).isNotEmpty();
        assertThat(childrenOf(qc, line)).hasSize(1);
        assertThat(childrenOf(qc, line).get(0).path("quantity").asInt()).isEqualTo(3);
        assertConserved(s, 3);
    }

    /** 守卫：没签字不能开工、不能跳步、没全完工不能发货、质检三个数必须凑齐。 */
    @Test
    void theGuardsRejectOutOfOrderActions() throws Exception {
        Accepted a = accepted("guards", 2);
        String pendingLine = firstLineId(a.supplierOrderId(), a.supplier().token());
        assertConflict(rawPost("/supplier/orders/" + a.supplierOrderId() + "/lines/" + pendingLine + "/start",
                null, a.supplier().token()), "production.order_not_signed");

        Signed s = signed("guards2", 2);
        String line = lineId(s);
        assertConflict(rawPost(supplierLine(s, line) + "/produced", null, s.supplier().token()),
                "production.line_not_started");
        assertConflict(rawPost("/supplier/orders/" + s.supplierOrderId() + "/ship", SHIP, s.supplier().token()),
                "production.lines_unfinished");
        ok(rawPost(supplierLine(s, line) + "/start", null, s.supplier().token()));
        assertConflict(rawPost(supplierLine(s, line) + "/start", null, s.supplier().token()),
                "production.line_not_pending");
        assertConflict(rawPost("/supplier/orders/" + s.supplierOrderId() + "/ship", SHIP, s.supplier().token()),
                "production.lines_unfinished");
        assertConflict(rawPost(opsLine(s, line) + "/qc", new QcBody(2, 0, 0), ops), "production.line_not_shipped");

        ok(rawPost(supplierLine(s, line) + "/produced", null, s.supplier().token()));
        ok(rawPost("/supplier/orders/" + s.supplierOrderId() + "/ship", SHIP, s.supplier().token()));
        assertThat(rawPost(opsLine(s, line) + "/qc", new QcBody(1, 0, 0), ops).getStatusCode().value()).isEqualTo(400);
        assertConflict(rawPost(opsLine(s, line) + "/remake", null, ops), "production.line_not_scrapped");
        ok(rawPost(opsLine(s, line) + "/qc", new QcBody(2, 0, 0), ops));
        assertConflict(rawPost("/supplier/orders/" + s.supplierOrderId() + "/ship", SHIP, s.supplier().token()),
                "production.nothing_to_ship");
    }

    /** 越权：别家供应商 404，客户碰不到供应商 / 运营端。 */
    @Test
    void otherPartiesCannotTouchTheOrder() throws Exception {
        Signed s = signed("authz", 2);
        String line = lineId(s);
        Supplier other = supplier("authz-other", "0.8");

        assertThat(rawPost(supplierLine(s, line) + "/start", null, other.token()).getStatusCode().value())
                .isEqualTo(404);
        assertThat(rawPost("/supplier/orders/" + s.supplierOrderId() + "/ship", SHIP, other.token())
                .getStatusCode().value()).isEqualTo(404);
        assertThat(rawPost(supplierLine(s, line) + "/start", null, s.customer().token()).getStatusCode().value())
                .isEqualTo(403);
        assertThat(rawPost(opsLine(s, line) + "/qc", new QcBody(2, 0, 0), s.supplier().token())
                .getStatusCode().value()).isEqualTo(403);
        assertThat(exchange("/ops/production", HttpMethod.GET, null, s.customer().token()).getStatusCode().value())
                .isEqualTo(403);
        // 别家的行挂在别家的单上：即使运营路径对，行不属于这张单也是 404
        assertThat(rawPost("/ops/supplier-orders/" + s.supplierOrderId() + "/lines/" + UUID.randomUUID() + "/qc",
                new QcBody(2, 0, 0), ops).getStatusCode().value()).isEqualTo(404);
    }

    /** 客户端只看得到折叠后的四态，响应里不该出现供应侧的任何东西。 */
    @Test
    void theCustomerNeverSeesTheSupplySideDetail() throws Exception {
        Signed s = signed("privacy", 4);
        String line = lineId(s);
        shipAll(s);
        ok(rawPost(opsLine(s, line) + "/qc", new QcBody(1, 2, 1), ops));

        ResponseEntity<String> res = exchange("/customer/orders/" + s.customerOrderId(), HttpMethod.GET, null,
                s.customer().token());
        ok(res);
        String body = res.getBody();
        assertThat(body).doesNotContain("SCRAPPED").doesNotContain("REWORK").doesNotContain("QC_")
                .doesNotContain("supplier").doesNotContain("Supplier");
        assertThat(json.readTree(body).path("data").path("lines").get(0).path("fulfillmentStatus").asText())
                .isEqualTo("IN_PROGRESS");
    }

    /** 并发：同一行两次开工、两次质检，各自只有一个能成。 */
    @Test
    void concurrentActionsOnTheSameLineOnlySucceedOnce() throws Exception {
        for (int round = 0; round < 5; round++) {
            Signed s = signed("race-" + round, 2);
            String line = lineId(s);
            assertThat(inParallel(() -> rawPost(supplierLine(s, line) + "/start", null, s.supplier().token())))
                    .isEqualTo(1);
            ok(rawPost(supplierLine(s, line) + "/produced", null, s.supplier().token()));
            ok(rawPost("/supplier/orders/" + s.supplierOrderId() + "/ship", SHIP, s.supplier().token()));
            assertThat(inParallel(() -> rawPost(opsLine(s, line) + "/qc", new QcBody(1, 1, 0), ops))).isEqualTo(1);
            assertConserved(s, 2);
        }
    }

    // ---------- 发货（2026-11-24 拍板） ----------

    /** 供应商发给平台：承运商 + 运单号必填；返工后再发一次，两批的单号都留着，各自记着发了哪几行。 */
    @Test
    void supplierShipNeedsCarrierAndTrackingAndKeepsEveryBatch() throws Exception {
        Signed s = signed("ship-batches", 4);
        String line = lineId(s);
        ok(rawPost(supplierLine(s, line) + "/start", null, s.supplier().token()));
        ok(rawPost(supplierLine(s, line) + "/produced", null, s.supplier().token()));
        String ship = "/supplier/orders/" + s.supplierOrderId() + "/ship";
        assertThat(rawPost(ship, null, s.supplier().token()).getStatusCode().value()).isEqualTo(400);
        assertThat(rawPost(ship, new ShipBody(" ", "SF1"), s.supplier().token()).getStatusCode().value())
                .isEqualTo(400);
        assertThat(rawPost(ship, new ShipBody("SF", ""), s.supplier().token()).getStatusCode().value())
                .isEqualTo(400);

        JsonNode first = post(ship, new ShipBody("SF Express", "SF001"), s.supplier().token());
        assertThat(first.path("shipments")).hasSize(1);
        assertThat(first.path("shipments").get(0).path("carrier").asText()).isEqualTo("SF Express");
        assertThat(first.path("shipments").get(0).path("trackingNo").asText()).isEqualTo("SF001");
        assertThat(first.path("shipments").get(0).path("lineIds").get(0).asText()).isEqualTo(line);

        JsonNode qc = post(opsLine(s, line) + "/qc", new QcBody(2, 2, 0), ops);
        String rework = childrenOf(qc, line).get(0).path("id").asText();
        ok(rawPost(supplierLine(s, rework) + "/start", null, s.supplier().token()));
        ok(rawPost(supplierLine(s, rework) + "/produced", null, s.supplier().token()));
        JsonNode second = post(ship, new ShipBody("JD Logistics", "JD002"), s.supplier().token());
        assertThat(second.path("shipments")).hasSize(2);
        assertThat(second.path("shipments").get(1).path("trackingNo").asText()).isEqualTo("JD002");
        assertThat(second.path("shipments").get(1).path("lineIds").get(0).asText()).isEqualTo(rework);

        JsonNode opsView = post(opsLine(s, rework) + "/qc", new QcBody(2, 0, 0), ops);
        assertThat(opsView.path("shipments")).hasSize(2);
        assertThat(opsView.path("shipments").get(0).path("trackingNo").asText()).isEqualTo("SF001");
        assertConserved(s, 4);
    }

    /** 运营整单发给客户（承运商 + 运单号必填，只有待发货的单能发）→ 客户确认收货 → 已完成。 */
    @Test
    void opsShipsTheReadyOrderAndTheCustomerConfirmsReceipt() throws Exception {
        Signed s = signed("ship-customer", 2);
        String line = lineId(s);
        String ship = "/ops/customer-orders/" + s.customerOrderId() + "/ship";
        String confirm = "/customer/orders/" + s.customerOrderId() + "/confirm-receipt";
        shipAll(s);
        assertConflict(rawPost(ship, new ShipBody("DHL", "DHL1"), ops), "order.not_ready");
        ok(rawPost(opsLine(s, line) + "/qc", new QcBody(2, 0, 0), ops));
        assertThat(customerOrder(s).path("status").asText()).isEqualTo("READY");
        assertConflict(rawPost(confirm, null, s.customer().token()), "order.not_shipped");

        assertThat(rawPost(ship, null, ops).getStatusCode().value()).isEqualTo(400);
        assertThat(rawPost(ship, new ShipBody("DHL", " "), ops).getStatusCode().value()).isEqualTo(400);
        assertThat(rawPost(ship, new ShipBody("DHL", "DHL1"), s.customer().token()).getStatusCode().value())
                .isEqualTo(403);
        JsonNode shipped = post(ship, new ShipBody(" DHL Express ", " 1234567890 "), ops);
        assertThat(shipped.path("status").asText()).isEqualTo("SHIPPED");
        assertThat(shipped.path("shipment").path("carrier").asText()).isEqualTo("DHL Express");
        assertConflict(rawPost(ship, new ShipBody("DHL", "DHL2"), ops), "order.not_ready");

        JsonNode seen = customerOrder(s);
        assertThat(seen.path("status").asText()).isEqualTo("SHIPPED");
        assertThat(seen.path("shipment").path("carrier").asText()).isEqualTo("DHL Express");
        assertThat(seen.path("shipment").path("trackingNo").asText()).isEqualTo("1234567890");
        assertThat(seen.path("shipment").path("shippedAt").asText()).isNotEmpty();
        assertThat(seen.path("shipment").path("receivedAt").isMissingNode()
                || seen.path("shipment").path("receivedAt").isNull()).isTrue();
        // 发货人是谁不对客户暴露（白名单）
        assertThat(seen.toString()).doesNotContain("shippedBy");

        Customer other = register("ship-customer-other");
        assertThat(rawPost(confirm, null, other.token()).getStatusCode().value()).isEqualTo(404);
        JsonNode done = post(confirm, null, s.customer().token());
        assertThat(done.path("status").asText()).isEqualTo("COMPLETED");
        assertThat(done.path("shipment").path("receivedAt").asText()).isNotEmpty();
        assertConflict(rawPost(confirm, null, s.customer().token()), "order.not_shipped");
        assertThat(get("/ops/customer-orders/" + s.customerOrderId(), ops).path("status").asText())
                .isEqualTo("COMPLETED");
    }

    /**
     * 随货文件：运营在待发货 / 已发货时上传（PDF / JPG / PNG，按内容判），客户确认收货后不能再传；
     * 客户只看得到传完的；每签发一次下载链接落一行审计，别家客户 404 且不落审计。
     */
    @Test
    void shippingDocumentsAreUploadedByOpsAndAuditedOnDownload() throws Exception {
        Signed s = signed("ship-docs", 1);
        String line = lineId(s);
        String docs = "/ops/customer-orders/" + s.customerOrderId() + "/documents";
        shipAll(s);
        assertConflict(rawPost(docs, new DocumentUploadBody("qc.pdf", "application/pdf"), ops),
                "order.documents_locked");
        ok(rawPost(opsLine(s, line) + "/qc", new QcBody(1, 0, 0), ops));

        assertThat(rawPost(docs, new DocumentUploadBody("model.step", null), ops).getStatusCode().value())
                .isEqualTo(400);
        String docId = uploadDocument(s, "qc-report.pdf", PDF);
        String fake = post(docs, new DocumentUploadBody("fake.pdf", "application/pdf"), ops).path("fileId").asText();
        storage.put(documentKey(fake), new ByteArrayInputStream("hello".getBytes(StandardCharsets.UTF_8)), 5,
                "application/pdf");
        assertThat(rawPost(docs + "/" + fake + "/complete", null, ops).getStatusCode().value()).isEqualTo(400);

        JsonNode seen = customerOrder(s);
        assertThat(seen.path("documents")).hasSize(1);
        assertThat(seen.path("documents").get(0).path("originalFilename").asText()).isEqualTo("qc-report.pdf");
        assertThat(seen.toString()).doesNotContain("storageKey").doesNotContain("uploadedBy");

        String customerUrl = "/customer/orders/" + s.customerOrderId() + "/documents/" + docId + "/view-url";
        assertThat(get(customerUrl, s.customer().token()).path("url").asText()).isNotEmpty();
        assertThat(auditRows(docId, "CUSTOMER")).isEqualTo(1);
        Customer other = register("ship-docs-other");
        assertThat(exchange(customerUrl, HttpMethod.GET, null, other.token()).getStatusCode().value()).isEqualTo(404);
        assertThat(exchange("/customer/orders/" + s.customerOrderId() + "/documents/" + fake + "/view-url",
                HttpMethod.GET, null, s.customer().token()).getStatusCode().value()).isEqualTo(404);
        assertThat(get(docs + "/" + docId + "/view-url", ops).path("url").asText()).isNotEmpty();
        assertThat(auditRows(docId, "CUSTOMER")).isEqualTo(1);
        assertThat(auditRows(docId, "OPERATOR")).isEqualTo(1);

        ok(rawPost("/ops/customer-orders/" + s.customerOrderId() + "/ship", new ShipBody("UPS", "1Z999"), ops));
        uploadDocument(s, "material-cert.png", PNG);
        assertThat(customerOrder(s).path("documents")).hasSize(2);
        ok(rawPost("/customer/orders/" + s.customerOrderId() + "/confirm-receipt", null, s.customer().token()));
        assertConflict(rawPost(docs, new DocumentUploadBody("late.pdf", "application/pdf"), ops),
                "order.documents_locked");
    }

    private String uploadDocument(Signed s, String filename, byte[] bytes) throws Exception {
        String docs = "/ops/customer-orders/" + s.customerOrderId() + "/documents";
        String id = post(docs, new DocumentUploadBody(filename, null), ops).path("fileId").asText();
        storage.put(documentKey(id), new ByteArrayInputStream(bytes), bytes.length, "application/octet-stream");
        assertThat(post(docs + "/" + id + "/complete", null, ops).path("uploadStatus").asText())
                .isEqualTo("COMPLETED");
        return id;
    }

    private String documentKey(String documentId) {
        return jdbc.queryForObject("select storage_key from customer_order_document where id = ?", String.class,
                UUID.fromString(documentId));
    }

    private int auditRows(String documentId, String party) {
        Integer n = jdbc.queryForObject("select count(*) from customer_order_document_access_log"
                + " where document_id = ? and accessor_party_type = ?", Integer.class, UUID.fromString(documentId), party);
        return n == null ? 0 : n;
    }

    // ---------- 断言 ----------

    /** 数量守恒：活跃件数 + 还没补料的报废件数 = 客户要的件数（设计文档 12 §5）。 */
    private void assertConserved(Signed s, int expected) {
        Integer sum = jdbc.queryForObject(
                "select coalesce(sum(sp.quantity), 0) from supplier_order_part sp"
                        + " join ops_order_part op on op.id = sp.upstream_part_id"
                        + " where op.upstream_part_id = ?"
                        + " and sp.fulfillment_status not in ('SUPERSEDED', 'CANCELLED')"
                        + " and not (sp.fulfillment_status = 'SCRAPPED' and sp.superseded_by is not null)",
                Integer.class, UUID.fromString(s.customerOrderPartId()));
        assertThat(sum).isEqualTo(expected);
    }

    private int inParallel(Callable<ResponseEntity<String>> call) throws Exception {
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            List<Future<ResponseEntity<String>>> futures = List.of(pool.submit(call), pool.submit(call));
            int okCount = 0;
            for (Future<ResponseEntity<String>> f : futures) {
                if (f.get().getStatusCode().value() == 200) {
                    okCount++;
                }
            }
            return okCount;
        }
    }

    // ---------- 场景搭建 ----------

    private record Customer(String token, UUID orgId) {
    }

    private record Supplier(String token, String orgId) {
    }

    private record Accepted(Customer customer, Supplier supplier, String customerOrderId, String customerOrderPartId,
                            String opsOrderId, String supplierOrderId) {
    }

    private record Signed(Customer customer, Supplier supplier, String customerOrderId, String customerOrderPartId,
                          String opsOrderId, String supplierOrderId) {
    }

    private record OrderDraftBody(String title, LocalDate wantedDate) {
    }

    private record AddLineBody(String code, String name, int quantity, String material, String surfaceTreatment) {
    }

    private record UploadBody(String filename, String contentType) {
    }

    private record QuoteLineBody(UUID lineId, BigDecimal unitPriceCny) {
    }

    private record SendQuoteBody(String currency, String commitDate, List<QuoteLineBody> lines) {
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

    private record QcBody(int pass, int rework, int scrap) {
    }

    private record ShipBody(String carrier, String trackingNo) {
    }

    private record DocumentUploadBody(String filename, String contentType) {
    }

    private Signed signed(String tag, int quantity) throws Exception {
        Accepted a = accepted(tag, quantity);
        ok(rawPost("/ops/supplier-orders/" + a.supplierOrderId() + "/contract", null, ops));
        ok(rawPost("/supplier/orders/" + a.supplierOrderId() + "/sign", null, a.supplier().token()));
        return new Signed(a.customer(), a.supplier(), a.customerOrderId(), a.customerOrderPartId(), a.opsOrderId(),
                a.supplierOrderId());
    }

    /** 客户下单 → 报价 → 确认 → 运营组单挂市场 → 供应商接单。 */
    private Accepted accepted(String tag, int quantity) throws Exception {
        Customer c = register(tag);
        String orderId = post("/customer/orders", new OrderDraftBody(null, LocalDate.now().plusDays(30)), c.token()).path("id").asText();
        String code = "PR-" + UUID.randomUUID().toString().substring(0, 8);
        JsonNode line = post("/customer/orders/" + orderId + "/lines",
                new AddLineBody(code, "Part " + code, quantity, "AL6061", null), c.token());
        uploadPdf(c, line);
        ok(exchange("/customer/orders/" + orderId + "/ship-to", HttpMethod.PUT,
                new CustomerOrderController.ShipToRequest(addressOf(c)), c.token()));
        ok(rawPost("/customer/orders/" + orderId + "/submit", null, c.token()));
        ok(exchange("/ops/customers/" + c.orgId() + "/markup", HttpMethod.PUT, new MarkupBody(BigDecimal.ONE), ops));
        ok(rawPost("/ops/customer-orders/" + orderId + "/quotes", new SendQuoteBody("EUR", LocalDate.now().plusDays(20).toString(),
                List.of(new QuoteLineBody(UUID.fromString(line.path("id").asText()), new BigDecimal("50.00")))), ops));
        JsonNode quote = get("/customer/orders/" + orderId + "/quote", c.token());
        ok(rawPost("/customer/orders/" + orderId + "/quote/confirm", new ConfirmBody(
                UUID.fromString(quote.path("id").asText()), LocalDate.parse(quote.path("rateDate").asText())),
                c.token()));

        Supplier s = supplier(tag, "0.8");
        String opsOrderId = post("/ops/ops-orders", null, ops).path("id").asText();
        ok(rawPost("/ops/dispatch/allocate", Map.of("customerOrderPartId", line.path("id").asText(),
                "parts", List.of(Map.of("opsOrderId", opsOrderId, "quantity", quantity))), ops));
        ok(rawPost("/ops/ops-orders/" + opsOrderId + "/publish", new PublishBody(LocalDate.now().plusDays(10)), ops));
        String supplierOrderId = post("/supplier/offers/" + opsOrderId + "/accept", null, s.token()).path("id").asText();
        return new Accepted(c, s, orderId, line.path("id").asText(), opsOrderId, supplierOrderId);
    }

    private Supplier supplier(String tag, String discount) throws Exception {
        String email = "prod-" + tag + "-" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
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
        String email = "prod-" + tag + "-" + UUID.randomUUID() + "@example.com";
        JsonNode reg = post("/auth/register",
                new RegisterRequest(PartyType.CUSTOMER, "Acme " + tag, "DE", email, "password123", "Alice"), null);
        String token = post("/auth/login", new ExternalAuthController.ExternalLoginRequest(email, "password123"), null)
                .path("accessToken").asText();
        return new Customer(token, UUID.fromString(reg.path("orgId").asText()));
    }

    private String opsToken() throws Exception {
        String email = "prod-ops-" + UUID.randomUUID() + "@example.com";
        Organization internal = organizations.save(new Organization(Organization.Type.INTERNAL, "HQ prod", null));
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

    /** 把整单做完并发给平台。 */
    private void shipAll(Signed s) throws Exception {
        for (JsonNode l : get("/supplier/orders/" + s.supplierOrderId(), s.supplier().token()).path("lines")) {
            if (l.path("status").asText().equals("PENDING")) {
                ok(rawPost(supplierLine(s, l.path("id").asText()) + "/start", null, s.supplier().token()));
                ok(rawPost(supplierLine(s, l.path("id").asText()) + "/produced", null, s.supplier().token()));
            }
        }
        ok(rawPost("/supplier/orders/" + s.supplierOrderId() + "/ship", SHIP, s.supplier().token()));
    }

    // ---------- 取数 ----------

    private String supplierLine(Signed s, String lineId) {
        return "/supplier/orders/" + s.supplierOrderId() + "/lines/" + lineId;
    }

    private String opsLine(Signed s, String lineId) {
        return "/ops/supplier-orders/" + s.supplierOrderId() + "/lines/" + lineId;
    }

    private String lineId(Signed s) throws Exception {
        return firstLineId(s.supplierOrderId(), s.supplier().token());
    }

    private String firstLineId(String supplierOrderId, String supplierToken) throws Exception {
        return get("/supplier/orders/" + supplierOrderId, supplierToken).path("lines").get(0).path("id").asText();
    }

    private JsonNode lineOf(JsonNode supplierOrderView, String lineId) {
        for (JsonNode l : supplierOrderView.path("lines")) {
            if (l.path("id").asText().equals(lineId)) {
                return l;
            }
        }
        throw new AssertionError("line not found: " + lineId);
    }

    private JsonNode opsLineOf(JsonNode productionOrder, String lineId) {
        return lineOf(productionOrder, lineId);
    }

    /** 这一行拆出来的新行（按 replacesPartId 找）。 */
    private List<JsonNode> childrenOf(JsonNode productionOrder, String lineId) {
        List<JsonNode> out = new ArrayList<>();
        for (JsonNode l : productionOrder.path("lines")) {
            if (l.path("replacesPartId").asText().equals(lineId)) {
                out.add(l);
            }
        }
        return out;
    }

    private JsonNode customerOrder(Signed s) throws Exception {
        return get("/customer/orders/" + s.customerOrderId(), s.customer().token());
    }

    private JsonNode customerLine(Signed s) throws Exception {
        for (JsonNode l : customerOrder(s).path("lines")) {
            if (l.path("id").asText().equals(s.customerOrderPartId())) {
                return l;
            }
        }
        throw new AssertionError("customer line not found");
    }

    // ---------- HTTP helpers（返回 data 节点） ----------

    /** 收货地址从地址簿选（2026-11-26）：这个客户还没有地址就先加一条。 */
    private UUID addressOf(Customer c) throws Exception {
        JsonNode list = json.readTree(exchange("/customer/shipping-addresses", HttpMethod.GET, null, c.token())
                .getBody()).path("data");
        if (!list.isEmpty()) {
            return UUID.fromString(list.get(0).path("id").asText());
        }
        return UUID.fromString(post("/customer/shipping-addresses", new AddressBody("DE", "Acme Receiving GmbH",
                "Bob Weber", "+49 30 1234567", "Hauptstr. 1", null, "Berlin", null, "10115"), c.token())
                .path("id").asText());
    }

    private record AddressBody(String country, String company, String contact, String phone, String line1,
                               String line2, String city, String region, String postalCode) {
    }

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
