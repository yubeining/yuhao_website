package com.mfg.domain.order;

import com.mfg.common.security.PartyType;
import com.mfg.platform.auth.ExternalAuthController;
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
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 客户订单端到端：建草稿 → 加零件行 → 传图纸 → 提交（锁定版本）→ 再次下单沿用 → 换图纸。
 *
 * <p>真 Tomcat + 真过滤链 + 真 PostgreSQL + 真 Redis；存储是 memory，浏览器直传用 {@link StorageService#put} 模拟。
 *
 * <p>钉死的业务规则（2026-09-14 需求方拍板）：
 * <ul>
 *   <li>提交条件：每行都有至少一份传完的图纸。</li>
 *   <li>提交时锁定各行的图纸版本；同一图号再次下单沿用上次锁定的版本，换图纸开新版本。</li>
 *   <li>客户只能取消草稿（设计文档 12 §2）。</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class CustomerOrderFlowIT {

    private static final byte[] PDF =
            "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n".getBytes(StandardCharsets.US_ASCII);

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

    /**
     * 每个用例前清测试专用 Redis db（同 {@code AbstractIntegrationTest}）。
     *
     * <p>★ 注册接口按来源 IP 限流（每小时 20 次），测试全从 localhost 发。不清的话，
     * 这个类加上别的 HTTP 集成测试一次 {@code mvn verify} 就注册四十多次，
     * 从第 21 次起全部 429 —— 失败点在注册 helper 上，看起来像业务代码坏了。
     */
    @BeforeEach
    void flushRedis() {
        redis.execute((RedisConnection c) -> {
            c.serverCommands().flushDb();
            return null;
        });
    }

    // ---------- 草稿 ----------

    @Test
    void draftCanBeCreatedAndEdited() throws Exception {
        Customer c = register("draft");
        JsonNode created = post("/customer/orders",
                new CustomerOrderController.OrderDraftRequest("Batch 1", LocalDate.of(2026, 12, 1)), c.token()).path("data");
        assertThat(created.path("status").asText()).isEqualTo("DRAFT");
        assertThat(created.path("title").asText()).isEqualTo("Batch 1");
        assertThat(created.path("wantedDate").asText()).isEqualTo("2026-12-01");

        String id = created.path("id").asText();
        JsonNode edited = patch("/customer/orders/" + id,
                new CustomerOrderController.OrderDraftRequest("Batch 1b", null), c.token()).path("data");
        assertThat(edited.path("title").asText()).isEqualTo("Batch 1b");
        // 接口不输出值为 null 的字段（spring.jackson.default-property-inclusion: non_null），清空后字段直接不出现
        assertThat(edited.has("wantedDate")).isFalse();

        JsonNode list = get("/customer/orders", c.token()).path("data");
        assertThat(list.path("total").asInt()).isEqualTo(1);
        assertThat(list.path("items").get(0).path("id").asText()).isEqualTo(id);
    }

    /** 新图号：自动建零件 + 第 1 版，材料 / 表面处理记在行上。 */
    @Test
    void addingALineWithANewCodeCreatesThePartAndItsFirstRevision() throws Exception {
        Customer c = register("newline");
        String orderId = createOrder(c);
        String code = uniqueCode();

        JsonNode line = addLine(c, orderId, code, "Bracket", 100);
        assertThat(line.path("code").asText()).isEqualTo(code);
        assertThat(line.path("partName").asText()).isEqualTo("Bracket");
        assertThat(line.path("quantity").asInt()).isEqualTo(100);
        assertThat(line.path("material").asText()).isEqualTo("AL6061");
        assertThat(line.path("revision").path("revNo").asInt()).isEqualTo(1);
        assertThat(line.path("revision").path("locked").asBoolean()).isFalse();
        assertThat(jdbc.queryForObject("select count(*) from part_design where customer_org_id = ? and code = ?",
                Long.class, c.orgId(), code)).isEqualTo(1);
    }

    // ---------- 提交 ----------

    @Test
    void submittingRequiresADrawingOnEveryLine() throws Exception {
        Customer c = register("nodraw");
        String orderId = createOrder(c);
        JsonNode withDrawing = addLine(c, orderId, uniqueCode(), "A", 1);
        uploadPdf(c, withDrawing);
        JsonNode without = addLine(c, orderId, uniqueCode(), "B", 1);

        ResponseEntity<String> res = rawPost("/customer/orders/" + orderId + "/submit", null, c.token());
        assertThat(res.getStatusCode().value()).isEqualTo(409);
        assertThat(messageOf(res)).isEqualTo("order.line_missing_drawing");
        assertThat(json.readTree(res.getBody()).path("data").toString()).contains(without.path("id").asText());
        assertThat(orderStatus(orderId)).isEqualTo("DRAFT");
    }

    @Test
    void emptyOrderCannotBeSubmitted() throws Exception {
        Customer c = register("empty");
        String orderId = createOrder(c);
        ResponseEntity<String> res = rawPost("/customer/orders/" + orderId + "/submit", null, c.token());
        assertThat(res.getStatusCode().value()).isEqualTo(409);
        assertThat(messageOf(res)).isEqualTo("order.no_lines");
    }

    /**
     * 公司名没补 → 不能提交订单；补完就能提交。
     *
     * <p>注册阶段不收公司名（docs/design/14 §4），但订单一旦提交就是对外文件，
     * 报价单 / 合同 / 发票都要有主体。所以卡在提交这一步。
     */
    @Test
    void orderCannotBeSubmittedBeforeCompanyNameIsFilled() throws Exception {
        Customer c = registerWithoutCompany("submit");
        String orderId = createOrder(c);
        JsonNode line = addLine(c, orderId, uniqueCode(), "Bracket", 1);
        uploadPdf(c, line);

        // 零件和图纸都齐了，唯独公司没名字
        ResponseEntity<String> rejected = rawPost("/customer/orders/" + orderId + "/submit", null, c.token());
        assertThat(rejected.getStatusCode().value()).isEqualTo(400);
        assertThat(messageOf(rejected)).isEqualTo("organization.name_required");

        // 补公司名
        JsonNode renamed = patch("/customer/organization", Map.of("name", "Nachzügler GmbH"), c.token());
        assertThat(renamed.path("data").path("name").asText()).isEqualTo("Nachzügler GmbH");

        // 现在可以提交了
        JsonNode submitted = post("/customer/orders/" + orderId + "/submit", null, c.token()).path("data");
        assertThat(submitted.path("status").asText()).isEqualTo("SUBMITTED");
    }

    /** 提交锁定版本；之后订单和这一版的图纸都不能再动。 */
    @Test
    void submittingLocksTheRevisionAndFreezesTheOrder() throws Exception {
        Customer c = register("submit");
        String orderId = createOrder(c);
        JsonNode line = addLine(c, orderId, uniqueCode(), "Bracket", 5);
        UUID fileId = uploadPdf(c, line);
        String revId = line.path("revision").path("id").asText();
        String partId = line.path("partId").asText();
        String lineId = line.path("id").asText();

        JsonNode submitted = post("/customer/orders/" + orderId + "/submit", null, c.token()).path("data");
        assertThat(submitted.path("status").asText()).isEqualTo("SUBMITTED");
        assertThat(submitted.path("submittedAt").asText()).isNotBlank();
        assertThat(submitted.path("lines").get(0).path("revision").path("locked").asBoolean()).isTrue();

        // 版本已锁：不能再加 / 删文件
        assertConflict(rawPost("/customer/parts/" + partId + "/revisions/" + revId + "/files",
                new CustomerPartController.RequestUploadRequest("more.pdf", "application/pdf"), c.token()),
                "part.revision_locked");
        assertConflict(rawDelete("/customer/files/" + fileId, c.token()), "part.revision_locked");

        // 订单已提交：不能改、加、删、取消
        String base = "/customer/orders/" + orderId;
        assertConflict(rawPatch(base, new CustomerOrderController.OrderDraftRequest("x", null), c.token()), "order.not_draft");
        assertConflict(rawPost(base + "/lines", lineRequest(uniqueCode(), "C", 1), c.token()), "order.not_draft");
        assertConflict(rawPatch(base + "/lines/" + lineId,
                new CustomerOrderController.UpdateLineRequest("Bracket", 6, null, null), c.token()), "order.not_draft");
        assertConflict(rawDelete(base + "/lines/" + lineId, c.token()), "order.not_draft");
        assertConflict(rawPost(base + "/cancel", null, c.token()), "order.not_draft");
        assertConflict(rawPost(base + "/submit", null, c.token()), "order.not_draft");
    }

    @Test
    void concurrentSubmitsSucceedExactlyOnce() throws Exception {
        Customer c = register("race");
        String orderId = createOrder(c);
        uploadPdf(c, addLine(c, orderId, uniqueCode(), "Bracket", 1));

        ExecutorService pool = Executors.newFixedThreadPool(4);
        List<Integer> statuses = new ArrayList<>();
        try {
            List<Future<ResponseEntity<String>>> calls = new ArrayList<>();
            for (int i = 0; i < 4; i++) {
                Callable<ResponseEntity<String>> call =
                        () -> rawPost("/customer/orders/" + orderId + "/submit", null, c.token());
                calls.add(pool.submit(call));
            }
            for (Future<ResponseEntity<String>> f : calls) {
                statuses.add(f.get().getStatusCode().value());
            }
        } finally {
            pool.shutdownNow();
        }
        assertThat(statuses).allMatch(s -> s == 200 || s == 409);
        assertThat(statuses).filteredOn(s -> s == 200).hasSize(1);
        assertThat(orderStatus(orderId)).isEqualTo("SUBMITTED");
    }

    // ---------- 再次下单 / 换图纸 ----------

    /** 同一图号再次下单：挂上次锁定的版本、带出它的图纸；「换图纸」开新版本并改挂。 */
    @Test
    void reorderingTheSameCodeReusesTheLockedRevisionUntilTheDrawingIsReplaced() throws Exception {
        Customer c = register("reorder");
        String code = uniqueCode();
        String first = createOrder(c);
        JsonNode firstLine = addLine(c, first, code, "Bracket", 10);
        UUID firstFile = uploadPdf(c, firstLine);
        post("/customer/orders/" + first + "/submit", null, c.token());

        String second = createOrder(c);
        JsonNode reused = addLine(c, second, code, "Bracket", 20);
        assertThat(reused.path("revision").path("id").asText()).isEqualTo(firstLine.path("revision").path("id").asText());
        assertThat(reused.path("revision").path("locked").asBoolean()).isTrue();
        assertThat(reused.path("revision").path("files").get(0).path("id").asText()).isEqualTo(firstFile.toString());

        // 沿用的版本已经带图纸，所以不传也能提交
        assertThat(rawPost("/customer/orders/" + second + "/submit", null, c.token()).getStatusCode().value())
                .isEqualTo(200);

        String third = createOrder(c);
        JsonNode line = addLine(c, third, code, "Bracket", 5);
        JsonNode replaced = post("/customer/orders/" + third + "/lines/" + line.path("id").asText() + "/new-revision",
                new CustomerOrderController.NewRevisionRequest("B"), c.token()).path("data");
        assertThat(replaced.path("revision").path("revNo").asInt()).isEqualTo(2);
        assertThat(replaced.path("revision").path("customerRev").asText()).isEqualTo("B");
        assertThat(replaced.path("revision").path("locked").asBoolean()).isFalse();
        assertThat(replaced.path("revision").path("files")).isEmpty();
        // 前两张订单仍然锁着第 1 版
        assertThat(firstRevisionIdOf(first)).isEqualTo(firstLine.path("revision").path("id").asText());
    }

    @Test
    void newRevisionIsOnlyForALockedRevision() throws Exception {
        Customer c = register("newrev");
        String orderId = createOrder(c);
        JsonNode line = addLine(c, orderId, uniqueCode(), "Bracket", 1);
        assertConflict(rawPost("/customer/orders/" + orderId + "/lines/" + line.path("id").asText() + "/new-revision",
                new CustomerOrderController.NewRevisionRequest(null), c.token()), "part.revision_not_locked");
    }

    // ---------- 草稿操作 ----------

    @Test
    void draftLinesCanBeEditedAndRemovedAndDraftsCancelled() throws Exception {
        Customer c = register("edit");
        String orderId = createOrder(c);
        JsonNode line = addLine(c, orderId, uniqueCode(), "Bracket", 1);
        String lineId = line.path("id").asText();

        JsonNode edited = patch("/customer/orders/" + orderId + "/lines/" + lineId,
                new CustomerOrderController.UpdateLineRequest("Bracket v2", 7, "SS304", "anodized"), c.token()).path("data");
        assertThat(edited.path("partName").asText()).isEqualTo("Bracket v2");
        assertThat(edited.path("quantity").asInt()).isEqualTo(7);
        assertThat(edited.path("surfaceTreatment").asText()).isEqualTo("anodized");

        assertThat(rawDelete("/customer/orders/" + orderId + "/lines/" + lineId, c.token()).getStatusCode().value())
                .isEqualTo(200);
        assertThat(get("/customer/orders/" + orderId, c.token()).path("data").path("lines")).isEmpty();

        JsonNode cancelled = post("/customer/orders/" + orderId + "/cancel", null, c.token()).path("data");
        assertThat(cancelled.path("status").asText()).isEqualTo("CANCELLED");
    }

    @Test
    void quantityMustBePositive() throws Exception {
        Customer c = register("qty");
        String orderId = createOrder(c);
        ResponseEntity<String> res = rawPost("/customer/orders/" + orderId + "/lines", lineRequest(uniqueCode(), "A", 0), c.token());
        assertThat(res.getStatusCode().value()).isEqualTo(400);
    }

    // ---------- 租户隔离 ----------

    @Test
    void anotherCustomerCannotSeeOrTouchTheOrder() throws Exception {
        Customer owner = register("owner");
        Customer other = register("other");
        String orderId = createOrder(owner);
        JsonNode line = addLine(owner, orderId, uniqueCode(), "Bracket", 1);
        String base = "/customer/orders/" + orderId;

        assertNotFound(rawGet(base, other.token()));
        assertNotFound(rawPatch(base, new CustomerOrderController.OrderDraftRequest("x", null), other.token()));
        assertNotFound(rawPost(base + "/lines", lineRequest(uniqueCode(), "A", 1), other.token()));
        assertNotFound(rawDelete(base + "/lines/" + line.path("id").asText(), other.token()));
        assertNotFound(rawPost(base + "/submit", null, other.token()));
        assertNotFound(rawPost(base + "/cancel", null, other.token()));
        assertThat(get("/customer/orders", other.token()).path("data").path("total").asInt()).isZero();
    }

    // ---------- 带订单上下文看图（红线 1） ----------

    @Test
    void viewingADrawingInsideAnOrderRecordsTheOrderAsContext() throws Exception {
        Customer c = register("ctx");
        String orderId = createOrder(c);
        JsonNode line = addLine(c, orderId, uniqueCode(), "Bracket", 1);
        UUID fileId = uploadPdf(c, line);

        JsonNode view = get("/customer/orders/" + orderId + "/lines/" + line.path("id").asText()
                + "/files/" + fileId + "/view-url", c.token());
        assertThat(view.path("data").path("url").asText()).isNotBlank();

        Map<String, Object> row = jdbc.queryForMap(
                "select context_type, context_id, accessor_org_id from part_file_access_log where part_file_id = ?", fileId);
        assertThat(row.get("context_type")).isEqualTo("CUSTOMER_ORDER");
        assertThat(row.get("context_id")).isEqualTo(UUID.fromString(orderId));
        assertThat(row.get("accessor_org_id")).isEqualTo(c.orgId());
    }

    /** 这一行锁的不是这个文件所在的版本（或订单不是你的）：404，且不落审计 —— 不许拿假上下文污染审计。 */
    @Test
    void viewingWithAMismatchedOrderIsRejectedAndNotAudited() throws Exception {
        Customer c = register("ctxbad");
        Customer other = register("ctxother");
        String orderA = createOrder(c);
        JsonNode lineA = addLine(c, orderA, uniqueCode(), "A", 1);
        String orderB = createOrder(c);
        JsonNode lineB = addLine(c, orderB, uniqueCode(), "B", 1);
        UUID fileOfB = uploadPdf(c, lineB);

        assertNotFound(rawGet("/customer/orders/" + orderA + "/lines/" + lineA.path("id").asText()
                + "/files/" + fileOfB + "/view-url", c.token()));
        assertNotFound(rawGet("/customer/orders/" + orderB + "/lines/" + lineB.path("id").asText()
                + "/files/" + fileOfB + "/view-url", other.token()));
        assertThat(jdbc.queryForObject("select count(*) from part_file_access_log where part_file_id = ?",
                Long.class, fileOfB)).isZero();
    }

    // ---------- 请求本身有问题：应该是 4xx，不是 500 ----------

    /**
     * 非 UUID 的 id（比如旧原型留下的 SO-0001 书签）、错误的 Content-Type、不支持的方法 ——
     * 都是调用方的问题。回 500 会让前端以为服务端坏了，还会在日志里打一整条错误级全栈。
     */
    @Test
    void malformedRequestsAreClientErrorsNotServerErrors() throws Exception {
        Customer c = register("malformed");

        ResponseEntity<String> badId = rawGet("/customer/orders/SO-0001", c.token());
        assertThat(badId.getStatusCode().value()).as(badId.getBody()).isEqualTo(400);
        assertThat(messageOf(badId)).isEqualTo("common.bad_request");

        HttpHeaders plain = new HttpHeaders();
        plain.setBearerAuth(c.token());
        plain.setContentType(MediaType.TEXT_PLAIN);
        ResponseEntity<String> wrongType = rest.exchange(url("/customer/orders"), HttpMethod.POST,
                new HttpEntity<>("hello", plain), String.class);
        assertThat(wrongType.getStatusCode().value()).as(wrongType.getBody()).isEqualTo(415);
        assertThat(messageOf(wrongType)).isEqualTo("common.unsupported_media_type");

        ResponseEntity<String> wrongMethod = exchange("/customer/orders", HttpMethod.PUT,
                new CustomerOrderController.OrderDraftRequest(null, null), c.token());
        assertThat(wrongMethod.getStatusCode().value()).as(wrongMethod.getBody()).isEqualTo(405);
        assertThat(messageOf(wrongMethod)).isEqualTo("common.method_not_allowed");
    }

    /** 数量 1.5 以前会被静默截成 1 —— 数量要拿去算钱和排产，截断比报错危险得多。 */
    @Test
    void fractionalQuantityIsRejectedInsteadOfTruncated() throws Exception {
        Customer c = register("fraction");
        String orderId = createOrder(c);

        ResponseEntity<String> res = rawPost("/customer/orders/" + orderId + "/lines",
                Map.of("code", uniqueCode(), "name", "half", "quantity", 1.5), c.token());
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(400);
        assertThat(get("/customer/orders/" + orderId, c.token()).path("data").path("lines")).isEmpty();
    }

    // ---------- 并发：提交和改草稿同时发生 ----------

    /**
     * 提交检查完零件行、状态还没改之前，另一个请求往订单里加了一行（没图纸、版本没锁）。
     * 两个请求都成功的话，已提交的订单里就会有一行没锁定、也没图纸 —— 这正是提交要挡住的东西。
     * 每轮用栅栏让两个请求尽量同时出发，跑 30 轮。
     */
    @Test
    void addingALineWhileSubmittingNeverLeavesAnUnlockedLineOnASubmittedOrder() throws Exception {
        Customer c = register("race-add");
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int round = 0; round < 30; round++) {
                String orderId = createOrder(c);
                uploadPdf(c, addLine(c, orderId, uniqueCode(), "ready", 1));
                String base = "/customer/orders/" + orderId;
                CyclicBarrier go = new CyclicBarrier(2);
                Future<ResponseEntity<String>> submit = pool.submit(() -> {
                    go.await();
                    return rawPost(base + "/submit", null, c.token());
                });
                Future<ResponseEntity<String>> add = pool.submit(() -> {
                    go.await();
                    return rawPost(base + "/lines", lineRequest(uniqueCode(), "late", 1), c.token());
                });
                int s = submit.get().getStatusCode().value();
                int a = add.get().getStatusCode().value();
                assertThat(List.of(s, a)).as("round %d", round).allMatch(code -> code == 200 || code == 409);
                if ("SUBMITTED".equals(orderStatus(orderId))) {
                    Long unlocked = jdbc.queryForObject("select count(*) from customer_order_part l"
                            + " join part_revision r on r.id = l.part_revision_id"
                            + " where l.customer_order_id = ? and r.locked_at is null", Long.class, UUID.fromString(orderId));
                    assertThat(unlocked).as("round %d: submit=%d addLine=%d", round, s, a).isZero();
                }
            }
        } finally {
            pool.shutdownNow();
        }
    }

    /**
     * 提交检查完图纸、锁定还没生效之前，另一个请求删掉了这一行唯一的一份图纸。
     * 两个都成功的话，已提交的订单里就有一行没图纸。跑 30 轮。
     */
    @Test
    void removingTheLastDrawingWhileSubmittingNeverSubmitsALineWithoutADrawing() throws Exception {
        Customer c = register("race-rm");
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int round = 0; round < 30; round++) {
                String orderId = createOrder(c);
                JsonNode line = addLine(c, orderId, uniqueCode(), "ready", 1);
                UUID fileId = uploadPdf(c, line);
                UUID revisionId = UUID.fromString(line.path("revision").path("id").asText());
                CyclicBarrier go = new CyclicBarrier(2);
                Future<ResponseEntity<String>> submit = pool.submit(() -> {
                    go.await();
                    return rawPost("/customer/orders/" + orderId + "/submit", null, c.token());
                });
                Future<ResponseEntity<String>> remove = pool.submit(() -> {
                    go.await();
                    return rawDelete("/customer/files/" + fileId, c.token());
                });
                int s = submit.get().getStatusCode().value();
                int r = remove.get().getStatusCode().value();
                assertThat(List.of(s, r)).as("round %d", round).allMatch(code -> code == 200 || code == 409);
                if ("SUBMITTED".equals(orderStatus(orderId))) {
                    Long completed = jdbc.queryForObject("select count(*) from part_file"
                            + " where part_revision_id = ? and upload_status = 'COMPLETED'", Long.class, revisionId);
                    assertThat(completed).as("round %d: submit=%d removeFile=%d", round, s, r).isPositive();
                }
            }
        } finally {
            pool.shutdownNow();
        }
    }

    // ---------- 场景搭建 ----------

    private record Customer(String token, UUID orgId, UUID userId) {
    }

    /** 注册但不填公司名（docs/design/14 §4：注册阶段不收公司名）。 */
    private Customer registerWithoutCompany(String tag) throws Exception {
        String email = "noname-" + tag + "-" + UUID.randomUUID() + "@example.com";
        post("/auth/register",
                new RegisterRequest(PartyType.CUSTOMER, null, "DE", email, "password123", "Alice"), null);
        String token = post("/auth/login",
                new ExternalAuthController.ExternalLoginRequest(email, "password123"), null)
                .path("data").path("accessToken").asText();
        String orgId = get("/customer/organization", token).path("data").path("id").asText();
        assertThat(orgId).isNotBlank();
        return new Customer(token, UUID.fromString(orgId), null);
    }

    private Customer register(String tag) throws Exception {
        String email = "order-" + tag + "-" + UUID.randomUUID() + "@example.com";
        JsonNode reg = post("/auth/register",
                new RegisterRequest(PartyType.CUSTOMER, "Acme " + tag, "DE", email, "password123", "Alice"), null);
        String token = post("/auth/login",
                new ExternalAuthController.ExternalLoginRequest(email, "password123"), null)
                .path("data").path("accessToken").asText();
        return new Customer(token,
                UUID.fromString(reg.path("data").path("orgId").asText()),
                UUID.fromString(reg.path("data").path("id").asText()));
    }

    private String createOrder(Customer c) throws Exception {
        return post("/customer/orders", new CustomerOrderController.OrderDraftRequest(null, null), c.token())
                .path("data").path("id").asText();
    }

    private CustomerOrderController.AddLineRequest lineRequest(String code, String name, int quantity) {
        return new CustomerOrderController.AddLineRequest(code, name, quantity, "AL6061", null, null);
    }

    private JsonNode addLine(Customer c, String orderId, String code, String name, int quantity) throws Exception {
        ResponseEntity<String> res = rawPost("/customer/orders/" + orderId + "/lines", lineRequest(code, name, quantity), c.token());
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
        return json.readTree(res.getBody()).path("data");
    }

    /** 往这一行当前挂的版本传一个真 PDF 并 complete。 */
    private UUID uploadPdf(Customer c, JsonNode line) throws Exception {
        String partId = line.path("partId").asText();
        String revId = line.path("revision").path("id").asText();
        JsonNode ticket = post("/customer/parts/" + partId + "/revisions/" + revId + "/files",
                new CustomerPartController.RequestUploadRequest("drawing.pdf", "application/pdf"), c.token());
        UUID fileId = UUID.fromString(ticket.path("data").path("fileId").asText());
        String key = jdbc.queryForObject("select storage_key from part_file where id = ?", String.class, fileId);
        storage.put(key, new ByteArrayInputStream(PDF), PDF.length, "application/pdf");
        assertThat(post("/customer/files/" + fileId + "/complete", null, c.token())
                .path("data").path("uploadStatus").asText()).isEqualTo("COMPLETED");
        return fileId;
    }

    private String orderStatus(String orderId) {
        return jdbc.queryForObject("select status from customer_order where id = ?", String.class, UUID.fromString(orderId));
    }

    private String firstRevisionIdOf(String orderId) {
        return jdbc.queryForObject("select part_revision_id::text from customer_order_part where customer_order_id = ?",
                String.class, UUID.fromString(orderId));
    }

    private static String uniqueCode() {
        return "LB-" + UUID.randomUUID().toString().substring(0, 8);
    }

    private void assertConflict(ResponseEntity<String> res, String code) throws Exception {
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(409);
        assertThat(messageOf(res)).isEqualTo(code);
    }

    private void assertNotFound(ResponseEntity<String> res) {
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(404);
    }

    // ---------- HTTP helpers（请求体走项目 ObjectMapper，不手写 JSON） ----------

    private JsonNode post(String path, Object body, String bearer) throws Exception {
        return json.readTree(rawPost(path, body, bearer).getBody());
    }

    private JsonNode patch(String path, Object body, String bearer) throws Exception {
        return json.readTree(rawPatch(path, body, bearer).getBody());
    }

    private JsonNode get(String path, String bearer) throws Exception {
        return json.readTree(rawGet(path, bearer).getBody());
    }

    private ResponseEntity<String> rawPost(String path, Object body, String bearer) {
        return exchange(path, HttpMethod.POST, body, bearer);
    }

    private ResponseEntity<String> rawPatch(String path, Object body, String bearer) {
        return exchange(path, HttpMethod.PATCH, body, bearer);
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
