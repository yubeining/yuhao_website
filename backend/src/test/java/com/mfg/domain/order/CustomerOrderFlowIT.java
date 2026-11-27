package com.mfg.domain.order;

import com.mfg.common.security.PartyType;
import com.mfg.common.security.UserPrincipal;
import com.mfg.platform.auth.JwtService;
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
import java.util.Set;
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

    @Autowired
    private JwtService jwtService;

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
        JsonNode created = post("/customer/orders", new CustomerOrderController.SaveOrderRequest("Batch 1",
                LocalDate.of(2026, 12, 1), null, null), c.token()).path("data").path("order");
        assertThat(created.path("status").asText()).isEqualTo("DRAFT");
        assertThat(created.path("title").asText()).isEqualTo("Batch 1");
        assertThat(created.path("wantedDate").asText()).isEqualTo("2026-12-01");

        String id = created.path("id").asText();
        JsonNode edited = save(c, id,
                new CustomerOrderController.SaveOrderRequest("Batch 1b", null, null, List.of())).path("order");
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

    // ---------- 收货地址（2026-11-23：提交时必填，READY 之前都能改；2026-11-26：改成从地址簿选） ----------

    @Test
    void orderCannotBeSubmittedWithoutAShipToAddress() throws Exception {
        Customer c = register("noshipto");
        String orderId = createOrderWithoutShipTo(c);
        uploadPdf(c, addLine(c, orderId, uniqueCode(), "Bracket", 1));

        ResponseEntity<String> rejected = rawPost("/customer/orders/" + orderId + "/submit", null, c.token());
        assertThat(rejected.getStatusCode().value()).as(rejected.getBody()).isEqualTo(400);
        assertThat(messageOf(rejected)).isEqualTo("order.ship_to_required");
        assertThat(orderStatus(orderId)).isEqualTo("DRAFT");

        JsonNode saved = json.readTree(rawPut("/customer/orders/" + orderId + "/ship-to", shipTo("Berlin"), c.token())
                .getBody()).path("data");
        assertThat(saved.path("shipTo").path("country").asText()).isEqualTo("DE");
        assertThat(saved.path("shipTo").path("company").asText()).isEqualTo("Acme Receiving GmbH");
        assertThat(saved.path("shipTo").path("city").asText()).isEqualTo("Berlin");
        assertThat(saved.path("shipTo").has("line2")).isFalse();

        assertThat(post("/customer/orders/" + orderId + "/submit", null, c.token()).path("data").path("status").asText())
                .isEqualTo("SUBMITTED");
    }

    @Test
    void draftWithoutShipToHasNoShipToField() throws Exception {
        Customer c = register("blankshipto");
        String orderId = createOrderWithoutShipTo(c);
        assertThat(get("/customer/orders/" + orderId, c.token()).path("data").has("shipTo")).isFalse();
    }

    @Test
    void shipToCanBeChangedAfterSubmitUntilTheOrderIsReady() throws Exception {
        Customer c = register("shiptoedit");
        String orderId = createOrder(c);
        uploadPdf(c, addLine(c, orderId, uniqueCode(), "Bracket", 1));
        post("/customer/orders/" + orderId + "/submit", null, c.token());
        String path = "/customer/orders/" + orderId + "/ship-to";

        for (String status : List.of("SUBMITTED", "QUOTED", "CONFIRMED")) {
            jdbc.update("update customer_order set status = ? where id = ?", status, UUID.fromString(orderId));
            ResponseEntity<String> res = rawPut(path, shipTo("Munich-" + status), c.token());
            assertThat(res.getStatusCode().value()).as(status + " " + res.getBody()).isEqualTo(200);
            assertThat(json.readTree(res.getBody()).path("data").path("shipTo").path("city").asText())
                    .isEqualTo("Munich-" + status);
        }
        for (String status : List.of("READY", "CANCELLED")) {
            jdbc.update("update customer_order set status = ? where id = ?", status, UUID.fromString(orderId));
            assertConflict(rawPut(path, shipTo("Cologne"), c.token()), "order.ship_to_locked");
        }
        assertThat(jdbc.queryForObject("select ship_to_city from customer_order where id = ?", String.class,
                UUID.fromString(orderId))).isEqualTo("Munich-CONFIRMED");
    }

    /** 订单上的地址是订单自己的一份（2026-11-27：可以直接改，不连地址簿）；必填项照地址簿的规则校验。 */
    @Test
    void shipToRejectsAnIncompleteAddress() throws Exception {
        Customer c = register("shiptobad");
        String orderId = createOrderWithoutShipTo(c);
        String path = "/customer/orders/" + orderId + "/ship-to";

        CustomerOrderController.ShipToFields noCity = new CustomerOrderController.ShipToFields("DE", "Acme", "Bob",
                "+49 30 1", "Hauptstr. 1", null, " ", null, null);
        CustomerOrderController.ShipToFields badCountry = new CustomerOrderController.ShipToFields("Germany", "Acme",
                "Bob", "+49 30 1", "Hauptstr. 1", null, "Berlin", null, null);
        assertThat(rawPut(path, noCity, c.token()).getStatusCode().value()).isEqualTo(400);
        assertThat(rawPut(path, badCountry, c.token()).getStatusCode().value()).isEqualTo(400);
        assertThat(rawPut("/customer/orders/" + orderId, new CustomerOrderController.SaveOrderRequest(null, null,
                noCity, List.of()), c.token()).getStatusCode().value()).isEqualTo(400);
        assertThat(get("/customer/orders/" + orderId, c.token()).path("data").has("shipTo")).isFalse();
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

        JsonNode submitted = post("/customer/orders/" + orderId + "/submit", null, c.token()).path("data");
        assertThat(submitted.path("status").asText()).isEqualTo("SUBMITTED");
        assertThat(submitted.path("submittedAt").asText()).isNotBlank();
        assertThat(submitted.path("lines").get(0).path("revision").path("locked").asBoolean()).isTrue();

        // 版本已锁：不能再加 / 删文件
        assertConflict(rawPost("/customer/parts/" + partId + "/revisions/" + revId + "/files",
                new CustomerPartController.RequestUploadRequest("more.pdf", "application/pdf"), c.token()),
                "part.revision_locked");
        assertConflict(rawDelete("/customer/files/" + fileId, c.token()), "part.revision_locked");

        // 订单已提交：不能再整张保存（改、加、删行都走这里）、不能取消
        String base = "/customer/orders/" + orderId;
        assertConflict(rawPut(base, saveRequest(c, orderId, List.of(keep(submitted.path("lines").get(0)),
                newLine(uniqueCode(), "C", 1))), c.token()), "order.not_draft");
        assertConflict(rawPut(base, saveRequest(c, orderId, List.of()), c.token()), "order.not_draft");
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

    // ---------- 再次下单 ----------

    /**
     * 图号不再唯一（2026-11-26 拍板，取代 D16）：同一图号再加一次就是一个新零件 + 第 1 版，
     * 不沿用上次的版本和图纸；同一张订单里加两次同一图号也一样。
     */
    @Test
    void sameCodeAlwaysCreatesANewPart() throws Exception {
        Customer c = register("reorder");
        String code = uniqueCode();
        String first = createOrder(c);
        JsonNode firstLine = addLine(c, first, code, "Bracket", 10);
        uploadPdf(c, firstLine);
        post("/customer/orders/" + first + "/submit", null, c.token());

        String second = createOrder(c);
        JsonNode again = addLine(c, second, code, "Bracket", 20);
        JsonNode twice = addLine(c, second, code, "Bracket", 5);
        for (JsonNode line : List.of(again, twice)) {
            assertThat(line.path("partId").asText()).isNotEqualTo(firstLine.path("partId").asText());
            assertThat(line.path("revision").path("revNo").asInt()).isEqualTo(1);
            assertThat(line.path("revision").path("locked").asBoolean()).isFalse();
            assertThat(line.path("revision").path("files")).isEmpty();
        }
        assertThat(again.path("partId").asText()).isNotEqualTo(twice.path("partId").asText());
        assertThat(jdbc.queryForObject("select count(*) from part_design where customer_org_id = ? and code = ?",
                Long.class, c.orgId(), code)).isEqualTo(3);

        // 新零件没有图纸，不传不能提交
        assertConflict(rawPost("/customer/orders/" + second + "/submit", null, c.token()), "order.line_missing_drawing");
    }

    /**
     * 2026-11-18 review 发现：删草稿把各行指向的图纸版本整个删掉，不管它是不是已锁定、是不是被已提交的订单用着。
     * 再次下单沿用的正是上次锁定的版本，所以「再下一单 → 删掉这张草稿」会把原订单的图纸一起删了。
     */
    @Test
    void deletingADraftKeepsTheLockedRevisionItReused() throws Exception {
        Customer c = register("deldraft");
        String code = uniqueCode();
        String first = createOrder(c);
        JsonNode firstLine = addLine(c, first, code, "Bracket", 10);
        UUID fileId = uploadPdf(c, firstLine);
        post("/customer/orders/" + first + "/submit", null, c.token());
        String key = jdbc.queryForObject("select storage_key from part_file where id = ?", String.class, fileId);

        String draft = createOrder(c);
        addLine(c, draft, code, "Bracket", 20);
        // 草稿里另一行是全新的图号：它自己的未锁定版本应该跟着草稿一起删掉
        JsonNode fresh = addLine(c, draft, uniqueCode(), "Plate", 1);
        UUID freshFile = uploadPdf(c, fresh);
        assertThat(rawDelete("/customer/orders/" + draft, c.token()).getStatusCode().value()).isEqualTo(204);

        JsonNode kept = get("/customer/orders/" + first, c.token()).path("data");
        assertThat(kept.path("lines").get(0).path("revision").path("files").get(0).path("id").asText())
                .isEqualTo(fileId.toString());
        assertThat(storage.exists(key)).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from part_file where id = ?", Long.class, freshFile)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from part_revision where id = ?::uuid", Long.class,
                fresh.path("revision").path("id").asText())).isZero();
    }

    /**
     * 2026-11-18 review：上传用的签名 PUT 链接在有效期内可以反复用。上传完成、订单提交锁定之后，
     * 客户再往同一个链接传一份别的文件，运营和供应商看到的「已锁定图纸」就被悄悄换掉了。
     * 现在完成那一刻把对象挪到客户不知道的新地址，旧地址删掉。
     */
    @Test
    void reusingTheUploadUrlAfterCompletionCannotReplaceTheDrawing() throws Exception {
        Customer c = register("pin");
        String orderId = createOrder(c);
        JsonNode line = addLine(c, orderId, uniqueCode(), "Bracket", 1);
        JsonNode ticket = post("/customer/parts/" + line.path("partId").asText() + "/revisions/"
                        + line.path("revision").path("id").asText() + "/files",
                new CustomerPartController.RequestUploadRequest("drawing.pdf", "application/pdf"), c.token());
        String uploadId = ticket.path("data").path("uploadId").asText();
        // 上传地址是服务端内部细节，接口不返回 —— 测试从凭证里读
        String uploadKey = json.readTree(redis.opsForValue().get("mfg:party:" + c.orgId() + ":upload:" + uploadId))
                .path("uploadKey").asText();
        storage.put(uploadKey, new ByteArrayInputStream(PDF), PDF.length, "application/pdf");
        UUID fileId = UUID.fromString(post("/customer/uploads/" + uploadId + "/complete", null, c.token())
                .path("data").path("id").asText());
        post("/customer/orders/" + orderId + "/submit", null, c.token());

        // 客户拿着还没过期的上传链接再传一次
        byte[] other = "%PDF-1.7\nSOMETHING ELSE ENTIRELY\n".getBytes(StandardCharsets.US_ASCII);
        storage.put(uploadKey, new ByteArrayInputStream(other), other.length, "application/pdf");

        String finalKey = jdbc.queryForObject("select storage_key from part_file where id = ?", String.class, fileId);
        assertThat(finalKey).isNotEqualTo(uploadKey);
        try (java.io.InputStream in = storage.get(finalKey)) {
            assertThat(in.readAllBytes()).isEqualTo(PDF);
        }
    }

    // ---------- 整张保存（2026-11-27：订单页整页编辑，一次保存） ----------

    /** 新建时整张一起建：每行各自一个新零件 + 第 1 版，同图号也各算一行；返回新行的 id，顺序和请求一致。 */
    @Test
    void creatingWithLinesBuildsTheWholeOrderAtOnce() throws Exception {
        Customer c = register("create");
        String code = uniqueCode();
        JsonNode saved = post("/customer/orders", new CustomerOrderController.SaveOrderRequest("Batch",
                LocalDate.now().plusDays(30), shipTo("Berlin"), List.of(
                new CustomerOrderController.LineRequest(null, code, "Bracket", 4, "AL6061", "anodize", "A", null),
                newLine(code, "Bracket", 2),
                newLine(uniqueCode(), "Plate", 10))), c.token()).path("data");

        JsonNode order = saved.path("order");
        assertThat(order.path("lines")).hasSize(3);
        assertThat(saved.path("createdLineIds")).hasSize(3);
        JsonNode first = lineById(order, saved.path("createdLineIds").get(0).asText());
        assertThat(first.path("quantity").asInt()).isEqualTo(4);
        assertThat(first.path("surfaceTreatment").asText()).isEqualTo("anodize");
        assertThat(first.path("revision").path("customerRev").asText()).isEqualTo("A");
        assertThat(lineById(order, saved.path("createdLineIds").get(1).asText()).path("partId").asText())
                .isNotEqualTo(first.path("partId").asText());
        assertThat(order.path("shipTo").path("city").asText()).isEqualTo("Berlin");
    }

    /** 一次保存里同时改、加、删行，删文件；没带的行被删掉。 */
    @Test
    void savingReplacesTheDraftInOneGo() throws Exception {
        Customer c = register("edit");
        String orderId = createOrder(c);
        JsonNode kept = addLine(c, orderId, uniqueCode(), "Bracket", 1);
        UUID fileId = uploadPdf(c, kept);
        UUID secondFile = uploadPdf(c, kept);
        addLine(c, orderId, uniqueCode(), "Doomed", 1);
        String key = jdbc.queryForObject("select storage_key from part_file where id = ?", String.class, fileId);
        String code = uniqueCode();

        JsonNode saved = save(c, orderId, new CustomerOrderController.SaveOrderRequest("Renamed", null, shipTo("Bonn"),
                List.of(new CustomerOrderController.LineRequest(UUID.fromString(kept.path("id").asText()), code,
                                "Bracket v2", 7, "SS304", "anodized", "B", List.of(fileId)),
                        newLine(uniqueCode(), "Plate", 3))));

        JsonNode order = saved.path("order");
        assertThat(order.path("title").asText()).isEqualTo("Renamed");
        assertThat(order.path("shipTo").path("city").asText()).isEqualTo("Bonn");
        assertThat(order.path("lines")).hasSize(2);
        JsonNode edited = lineById(order, kept.path("id").asText());
        assertThat(edited.path("code").asText()).isEqualTo(code);
        assertThat(edited.path("partName").asText()).isEqualTo("Bracket v2");
        assertThat(edited.path("quantity").asInt()).isEqualTo(7);
        assertThat(edited.path("material").asText()).isEqualTo("SS304");
        assertThat(edited.path("surfaceTreatment").asText()).isEqualTo("anodized");
        assertThat(edited.path("revision").path("customerRev").asText()).isEqualTo("B");
        assertThat(edited.path("revision").path("files")).hasSize(1);
        assertThat(edited.path("revision").path("files").get(0).path("id").asText()).isEqualTo(secondFile.toString());
        assertThat(saved.path("createdLineIds")).hasSize(1);
        // 文件行留着（可能有审计指向它），状态改成 REMOVED；对象在事务提交后删掉
        assertThat(jdbc.queryForObject("select upload_status from part_file where id = ?", String.class, fileId))
                .isEqualTo("REMOVED");
        assertThat(storage.exists(key)).isFalse();

        JsonNode cancelled = post("/customer/orders/" + orderId + "/cancel", null, c.token()).path("data");
        assertThat(cancelled.path("status").asText()).isEqualTo("CANCELLED");
    }

    /** 草稿可以存没填齐的行（2026-11-27）：图号 / 名称 / 数量都可以空着，提交时才拦。 */
    @Test
    void draftCanHoldIncompleteLinesButCannotSubmitThem() throws Exception {
        Customer c = register("incomplete");
        String orderId = createOrder(c);
        JsonNode complete = addLine(c, orderId, uniqueCode(), "Bracket", 1);
        uploadPdf(c, complete);
        JsonNode saved = save(c, orderId, saveRequest(c, orderId, List.of(keep(complete),
                new CustomerOrderController.LineRequest(null, null, null, null, null, null, null, null))));
        JsonNode blank = lineById(saved.path("order"), saved.path("createdLineIds").get(0).asText());
        assertThat(blank.has("code")).isFalse();
        assertThat(blank.has("partName")).isFalse();
        assertThat(blank.has("quantity")).isFalse();
        uploadPdf(c, blank);

        ResponseEntity<String> res = rawPost("/customer/orders/" + orderId + "/submit", null, c.token());
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(400);
        assertThat(messageOf(res)).isEqualTo("order.line_incomplete");
        assertThat(json.readTree(res.getBody()).path("data").toString()).contains(blank.path("id").asText())
                .doesNotContain(complete.path("id").asText());
        assertThat(orderStatus(orderId)).isEqualTo("DRAFT");
    }

    @Test
    void quantityMustBePositive() throws Exception {
        Customer c = register("qty");
        String orderId = createOrder(c);
        ResponseEntity<String> res = rawPut("/customer/orders/" + orderId,
                saveRequest(c, orderId, List.of(newLine(uniqueCode(), "A", 0))), c.token());
        assertThat(res.getStatusCode().value()).isEqualTo(400);
    }

    /** 任何一行出错，整张都不落库。 */
    @Test
    void saveRejectsTheWholeRequestWhenOneLineIsInvalid() throws Exception {
        Customer c = register("savebad");
        String orderId = createOrder(c);
        JsonNode existing = addLine(c, orderId, uniqueCode(), "Keep", 1);
        CustomerOrderController.LineRequest renamed = new CustomerOrderController.LineRequest(
                UUID.fromString(existing.path("id").asText()), existing.path("code").asText(), "Renamed", 1,
                null, null, null, null);
        ResponseEntity<String> res = rawPut("/customer/orders/" + orderId, saveRequest(c, orderId, List.of(renamed,
                new CustomerOrderController.LineRequest(UUID.randomUUID(), "X", "Ghost", 1, null, null, null, null))),
                c.token());
        assertNotFound(res);
        JsonNode lines = get("/customer/orders/" + orderId, c.token()).path("data").path("lines");
        assertThat(lines).hasSize(1);
        assertThat(lines.get(0).path("partName").asText()).isEqualTo("Keep");
    }

    /** 请求体里的行 id、文件 id 必须是这张订单自己的（§3 铁律 2/3）。 */
    @Test
    void saveRejectsLinesAndFilesFromAnotherOrder() throws Exception {
        Customer c = register("foreignids");
        String orderA = createOrder(c);
        JsonNode lineA = addLine(c, orderA, uniqueCode(), "A", 1);
        String orderB = createOrder(c);
        JsonNode lineB = addLine(c, orderB, uniqueCode(), "B", 1);
        UUID fileOfB = uploadPdf(c, lineB);

        CustomerOrderController.LineRequest stolenLine = keep(lineB);
        assertNotFound(rawPut("/customer/orders/" + orderA, saveRequest(c, orderA, List.of(keep(lineA), stolenLine)),
                c.token()));
        CustomerOrderController.LineRequest stolenFile = new CustomerOrderController.LineRequest(
                UUID.fromString(lineA.path("id").asText()), lineA.path("code").asText(), "A", 1, null, null, null,
                List.of(fileOfB));
        assertNotFound(rawPut("/customer/orders/" + orderA, saveRequest(c, orderA, List.of(stolenFile)), c.token()));
        assertThat(jdbc.queryForObject("select upload_status from part_file where id = ?", String.class, fileOfB))
                .isEqualTo("COMPLETED");
    }

    @Test
    void saveOnlyWorksOnYourOwnDraft() throws Exception {
        Customer owner = register("saveowner");
        Customer other = register("saveother");
        String orderId = createOrder(owner);
        uploadPdf(owner, addLine(owner, orderId, uniqueCode(), "A", 1));
        CustomerOrderController.SaveOrderRequest body = saveRequest(owner, orderId, List.of());

        assertNotFound(rawPut("/customer/orders/" + orderId, body, other.token()));
        post("/customer/orders/" + orderId + "/submit", null, owner.token());
        assertConflict(rawPut("/customer/orders/" + orderId, body, owner.token()), "order.not_draft");
    }

    /**
     * 11-26 之前的草稿行可能挂着别的订单锁定过的版本（D16 沿用）。锁定的版本不能再改：
     * 换客户版本、删文件都拒绝；只改行上的字段（名称、数量…）照常。
     */
    @Test
    void aLineOnALockedRevisionKeepsItsDrawingsAndRevision() throws Exception {
        Customer c = register("lockedrev");
        String first = createOrder(c);
        JsonNode submittedLine = addLine(c, first, uniqueCode(), "Bracket", 1);
        UUID fileId = uploadPdf(c, submittedLine);
        post("/customer/orders/" + first + "/submit", null, c.token());

        String draft = createOrder(c);
        JsonNode line = addLine(c, draft, uniqueCode(), "Bracket", 1);
        jdbc.update("update customer_order_part set part_revision_id = ?::uuid where id = ?::uuid",
                submittedLine.path("revision").path("id").asText(), line.path("id").asText());
        JsonNode reloaded = get("/customer/orders/" + draft, c.token()).path("data").path("lines").get(0);
        UUID lineId = UUID.fromString(reloaded.path("id").asText());
        String code = reloaded.path("code").asText();

        assertConflict(rawPut("/customer/orders/" + draft, saveRequest(c, draft, List.of(
                new CustomerOrderController.LineRequest(lineId, code, "Bracket", 1, null, null, "Z", null))), c.token()),
                "part.revision_locked");
        assertConflict(rawPut("/customer/orders/" + draft, saveRequest(c, draft, List.of(
                new CustomerOrderController.LineRequest(lineId, code, "Bracket", 1, null, null, null, List.of(fileId)))),
                c.token()), "part.revision_locked");
        JsonNode ok = save(c, draft, saveRequest(c, draft, List.of(
                new CustomerOrderController.LineRequest(lineId, code, "Bracket", 9, null, null, null, null))));
        assertThat(ok.path("order").path("lines").get(0).path("quantity").asInt()).isEqualTo(9);
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
        assertNotFound(rawPut(base, saveRequest(owner, orderId, List.of(keep(line), newLine(uniqueCode(), "A", 1))),
                other.token()));
        assertNotFound(rawPut(base, saveRequest(owner, orderId, List.of()), other.token()));
        assertNotFound(rawPost(base + "/submit", null, other.token()));
        assertNotFound(rawPost(base + "/cancel", null, other.token()));
        assertNotFound(rawPut(base + "/ship-to", shipTo("Hamburg"), other.token()));
        assertThat(get(base, owner.token()).path("data").path("lines")).hasSize(1);
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
                new CustomerOrderController.SaveOrderRequest(null, null, null, null), c.token());
        assertThat(wrongMethod.getStatusCode().value()).as(wrongMethod.getBody()).isEqualTo(405);
        assertThat(messageOf(wrongMethod)).isEqualTo("common.method_not_allowed");
    }

    // ---------- 整张保存：补测（docs/test-cases/order-whole-page-edit.md 里标 ❌ 的） ----------

    /** #3 #4：新建时行不能带 id、不能带要删的图纸；出错不留下订单。 */
    @Test
    void createRejectsLineIdsAndFileRemovalsAndLeavesNoOrder() throws Exception {
        Customer c = register("createbad");
        CustomerOrderController.LineRequest withId = new CustomerOrderController.LineRequest(UUID.randomUUID(),
                uniqueCode(), "A", 1, null, null, null, null);
        CustomerOrderController.LineRequest withRemoval = new CustomerOrderController.LineRequest(null,
                uniqueCode(), "A", 1, null, null, null, List.of(UUID.randomUUID()));
        ResponseEntity<String> a = rawPost("/customer/orders", new CustomerOrderController.SaveOrderRequest(null, null,
                shipTo("Berlin"), List.of(newLine(uniqueCode(), "ok", 1), withId)), c.token());
        assertNotFound(a);
        assertThat(messageOf(a)).isEqualTo("order.line_not_found");
        ResponseEntity<String> b = rawPost("/customer/orders", new CustomerOrderController.SaveOrderRequest(null, null,
                shipTo("Berlin"), List.of(withRemoval)), c.token());
        assertNotFound(b);
        assertThat(messageOf(b)).isEqualTo("part.file_not_found");
        assertThat(orderCount(c)).isZero();
    }

    /** #5 #6：地址不全、名称超长，新建都拒绝，不留订单。 */
    @Test
    void createRejectsAnIncompleteAddressOrTooLongTitle() throws Exception {
        Customer c = register("createval");
        CustomerOrderController.ShipToFields noCity = new CustomerOrderController.ShipToFields("DE", "Acme", "Bob",
                "+49 30 1", "Hauptstr. 1", null, "", null, null);
        assertThat(rawPost("/customer/orders", new CustomerOrderController.SaveOrderRequest(null, null, noCity, null),
                c.token()).getStatusCode().value()).isEqualTo(400);
        assertThat(rawPost("/customer/orders", new CustomerOrderController.SaveOrderRequest("x".repeat(201), null,
                null, null), c.token()).getStatusCode().value()).isEqualTo(400);
        assertThat(orderCount(c)).isZero();
    }

    /** #7 #8：没登录 401；别的端（供应商 / 运营）的身份进不了客户端的订单接口。 */
    @Test
    void orderEndpointsRejectAnonymousAndOtherPortals() {
        CustomerOrderController.SaveOrderRequest body = new CustomerOrderController.SaveOrderRequest(null, null, null, null);
        assertThat(rawPost("/customer/orders", body, null).getStatusCode().value()).isEqualTo(401);
        for (PartyType other : List.of(PartyType.SUPPLIER, PartyType.OPERATOR)) {
            String token = jwtService.issueAccessToken(new UserPrincipal(UUID.randomUUID(), UUID.randomUUID(), other,
                    null, "en", Set.of("MEMBER")));
            assertThat(rawPost("/customer/orders", body, token).getStatusCode().value()).as(other.name()).isEqualTo(403);
            assertThat(rawPut("/customer/orders/" + UUID.randomUUID(), body, token).getStatusCode().value())
                    .as(other.name()).isEqualTo(403);
        }
    }

    /** #11：整张保存没带地址 = 清空（草稿可以没地址）。 */
    @Test
    void savingWithoutAnAddressClearsIt() throws Exception {
        Customer c = register("clearaddr");
        String orderId = createOrder(c);
        JsonNode saved = save(c, orderId, new CustomerOrderController.SaveOrderRequest(null, null, null, List.of()));
        assertThat(saved.path("order").has("shipTo")).isFalse();
        assertThat(get("/customer/orders/" + orderId, c.token()).path("data").has("shipTo")).isFalse();
    }

    /** #14：客户版本超过 50 个字符拒绝。 */
    @Test
    void customerRevLongerThan50IsRejected() throws Exception {
        Customer c = register("revlen");
        String orderId = createOrder(c);
        ResponseEntity<String> res = rawPut("/customer/orders/" + orderId, saveRequest(c, orderId, List.of(
                new CustomerOrderController.LineRequest(null, uniqueCode(), "A", 1, null, null, "r".repeat(51), null))),
                c.token());
        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(get("/customer/orders/" + orderId, c.token()).path("data").path("lines")).isEmpty();
    }

    /** #16：同一个行 id 在一次保存里出现两次，拒绝。 */
    @Test
    void sameLineIdTwiceIsRejected() throws Exception {
        Customer c = register("dupid");
        String orderId = createOrder(c);
        JsonNode line = addLine(c, orderId, uniqueCode(), "Keep", 1);
        ResponseEntity<String> res = rawPut("/customer/orders/" + orderId,
                saveRequest(c, orderId, List.of(keep(line), keep(line))), c.token());
        assertNotFound(res);
        assertThat(messageOf(res)).isEqualTo("order.line_not_found");
        assertThat(get("/customer/orders/" + orderId, c.token()).path("data").path("lines")).hasSize(1);
    }

    /**
     * #24：保存失败时，这次要删的图纸还在 —— 文件状态跟着回滚，存储里的对象也没删（对象是事务提交后才删的）。
     * 第二份是别的订单的图纸：第一份已经在事务里改成 REMOVED 之后才失败，正好验证回滚。
     */
    @Test
    void aFailedSaveKeepsTheDrawingItWasAskedToRemove() throws Exception {
        Customer c = register("rollbackfile");
        String orderA = createOrder(c);
        JsonNode line = addLine(c, orderA, uniqueCode(), "A", 1);
        UUID fileId = uploadPdf(c, line);
        String key = jdbc.queryForObject("select storage_key from part_file where id = ?", String.class, fileId);
        String orderB = createOrder(c);
        UUID foreign = uploadPdf(c, addLine(c, orderB, uniqueCode(), "B", 1));

        CustomerOrderController.LineRequest both = new CustomerOrderController.LineRequest(
                UUID.fromString(line.path("id").asText()), line.path("code").asText(), "A", 1, null, null, null,
                List.of(fileId, foreign));
        assertNotFound(rawPut("/customer/orders/" + orderA, saveRequest(c, orderA, List.of(both)), c.token()));
        assertThat(jdbc.queryForObject("select upload_status from part_file where id = ?", String.class, fileId))
                .isEqualTo("COMPLETED");
        assertThat(storage.exists(key)).isTrue();
    }

    /** #26：已经删掉的图纸再删一次，不报错。 */
    @Test
    void removingAnAlreadyRemovedFileAgainIsHarmless() throws Exception {
        Customer c = register("rmtwice");
        String orderId = createOrder(c);
        JsonNode line = addLine(c, orderId, uniqueCode(), "A", 1);
        UUID fileId = uploadPdf(c, line);
        ok(rawDelete("/customer/files/" + fileId, c.token()));
        JsonNode saved = save(c, orderId, saveRequest(c, orderId, List.of(new CustomerOrderController.LineRequest(
                UUID.fromString(line.path("id").asText()), line.path("code").asText(), "A", 1, null, null, null,
                List.of(fileId)))));
        assertThat(saved.path("order").path("lines").get(0).path("revision").path("files")).isEmpty();
    }

    /**
     * #27：两个人同时保存同一张草稿 —— 后保存的覆盖（2026-11-27 拍板，不做冲突检测）。
     * 订单行锁让两次保存排队，结果必须是其中一份完整内容，不会两份混在一起。跑 10 轮。
     */
    @Test
    void concurrentSavesLeaveOneCompleteVersion() throws Exception {
        Customer c = register("racesave");
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int round = 0; round < 10; round++) {
                String orderId = createOrder(c);
                addLine(c, orderId, uniqueCode(), "start", 1);
                List<Future<ResponseEntity<String>>> calls = new ArrayList<>();
                CyclicBarrier go = new CyclicBarrier(2);
                for (String who : List.of("alice", "bob")) {
                    CustomerOrderController.SaveOrderRequest body = new CustomerOrderController.SaveOrderRequest(who,
                            null, shipTo("Berlin"), List.of(newLine(uniqueCode(), who, 1), newLine(uniqueCode(), who, 2)));
                    calls.add(pool.submit(() -> {
                        go.await();
                        return rawPut("/customer/orders/" + orderId, body, c.token());
                    }));
                }
                for (Future<ResponseEntity<String>> f : calls) {
                    assertThat(f.get().getStatusCode().value()).as("round %d", round).isEqualTo(200);
                }
                JsonNode order = get("/customer/orders/" + orderId, c.token()).path("data");
                String winner = order.path("title").asText();
                assertThat(order.path("lines")).as("round %d", round).hasSize(2);
                order.path("lines").forEach(l -> assertThat(l.path("partName").asText()).isEqualTo(winner));
            }
        } finally {
            pool.shutdownNow();
        }
    }

    /** #33：改订单上的地址，地址簿里那一条不变（订单存自己的一份，2026-11-27）。 */
    @Test
    void changingTheOrderAddressLeavesTheAddressBookAlone() throws Exception {
        Customer c = register("bookalone");
        ok(rawPost("/customer/shipping-addresses", Map.of("country", "DE", "company", "Acme Receiving GmbH",
                "contact", "Bob Weber", "phone", "+49 30 1234567", "line1", "Hauptstr. 1", "city", "Berlin"), c.token()));
        String orderId = createOrder(c);
        ok(rawPut("/customer/orders/" + orderId + "/ship-to", shipTo("Leipzig"), c.token()));
        save(c, orderId, new CustomerOrderController.SaveOrderRequest(null, null, shipTo("Dresden"), List.of()));
        JsonNode book = get("/customer/shipping-addresses", c.token()).path("data");
        assertThat(book).hasSize(1);
        assertThat(book.get(0).path("city").asText()).isEqualTo("Berlin");
        assertThat(get("/customer/orders/" + orderId, c.token()).path("data").path("shipTo").path("city").asText())
                .isEqualTo("Dresden");
    }

    /** #35：零件没填齐和缺图纸同时存在时，先报没填齐。 */
    @Test
    void incompleteLinesAreReportedBeforeMissingDrawings() throws Exception {
        Customer c = register("checkorder");
        String orderId = createOrder(c);
        addLine(c, orderId, uniqueCode(), "no drawing", 1);
        JsonNode saved = save(c, orderId, saveRequest(c, orderId, List.of(
                keep(get("/customer/orders/" + orderId, c.token()).path("data").path("lines").get(0)),
                new CustomerOrderController.LineRequest(null, uniqueCode(), null, 1, null, null, null, null))));
        uploadPdf(c, lineById(saved.path("order"), saved.path("createdLineIds").get(0).asText()));

        ResponseEntity<String> res = rawPost("/customer/orders/" + orderId + "/submit", null, c.token());
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(400);
        assertThat(messageOf(res)).isEqualTo("order.line_incomplete");
    }

    /** #36：只缺数量也不能提交。 */
    @Test
    void aLineWithoutQuantityBlocksSubmit() throws Exception {
        Customer c = register("noqty");
        String orderId = createOrder(c);
        JsonNode saved = save(c, orderId, saveRequest(c, orderId, List.of(
                new CustomerOrderController.LineRequest(null, uniqueCode(), "Bracket", null, null, null, null, null))));
        uploadPdf(c, saved.path("order").path("lines").get(0));
        ResponseEntity<String> res = rawPost("/customer/orders/" + orderId + "/submit", null, c.token());
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(400);
        assertThat(messageOf(res)).isEqualTo("order.line_incomplete");
    }

    private long orderCount(Customer c) {
        return jdbc.queryForObject("select count(*) from customer_order where customer_org_id = ?", Long.class, c.orgId());
    }
    /** 数量 1.5 以前会被静默截成 1 —— 数量要拿去算钱和排产，截断比报错危险得多。 */
    @Test
    void fractionalQuantityIsRejectedInsteadOfTruncated() throws Exception {
        Customer c = register("fraction");
        String orderId = createOrder(c);

        ResponseEntity<String> res = rawPut("/customer/orders/" + orderId,
                Map.of("lines", List.of(Map.of("code", uniqueCode(), "name", "half", "quantity", 1.5))), c.token());
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
                JsonNode ready = addLine(c, orderId, uniqueCode(), "ready", 1);
                uploadPdf(c, ready);
                String base = "/customer/orders/" + orderId;
                CustomerOrderController.SaveOrderRequest withLateLine =
                        saveRequest(c, orderId, List.of(keep(ready), newLine(uniqueCode(), "late", 1)));
                CyclicBarrier go = new CyclicBarrier(2);
                Future<ResponseEntity<String>> submit = pool.submit(() -> {
                    go.await();
                    return rawPost(base + "/submit", null, c.token());
                });
                Future<ResponseEntity<String>> add = pool.submit(() -> {
                    go.await();
                    return rawPut(base, withLateLine, c.token());
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

    /** 建草稿并填好收货地址（提交前必填，2026-11-23）。只想测「没填地址」时用 {@link #createOrderWithoutShipTo}。 */
    private String createOrder(Customer c) throws Exception {
        return createDraft(c, shipTo("Berlin"));
    }

    private String createOrderWithoutShipTo(Customer c) throws Exception {
        return createDraft(c, null);
    }

    private String createDraft(Customer c, CustomerOrderController.ShipToFields shipTo) throws Exception {
        ResponseEntity<String> res = ok(rawPost("/customer/orders",
                new CustomerOrderController.SaveOrderRequest(null, LocalDate.now().plusDays(30), shipTo, List.of()),
                c.token()));
        return json.readTree(res.getBody()).path("data").path("order").path("id").asText();
    }

    private static CustomerOrderController.ShipToFields shipTo(String city) {
        return new CustomerOrderController.ShipToFields("DE", "Acme Receiving GmbH", "Bob Weber", "+49 30 1234567",
                "Hauptstr. 1", null, city, null, "10115");
    }

    private static ResponseEntity<String> ok(ResponseEntity<String> res) {
        assertThat(res.getStatusCode().is2xxSuccessful()).as(res.getBody()).isTrue();
        return res;
    }

    /** 新加的一行（没有 id）。 */
    private static CustomerOrderController.LineRequest newLine(String code, String name, Integer quantity) {
        return new CustomerOrderController.LineRequest(null, code, name, quantity, "AL6061", null, null, null);
    }

    /** 已有的一行原样带上（整张保存时没带的行会被删掉）。 */
    private static CustomerOrderController.LineRequest keep(JsonNode line) {
        return new CustomerOrderController.LineRequest(UUID.fromString(line.path("id").asText()),
                textOrNull(line, "code"), textOrNull(line, "partName"),
                line.has("quantity") ? line.path("quantity").asInt() : null,
                textOrNull(line, "material"), textOrNull(line, "surfaceTreatment"),
                textOrNull(line.path("revision"), "customerRev"), null);
    }

    private static String textOrNull(JsonNode node, String field) {
        return node.has(field) ? node.path(field).asText() : null;
    }

    /** 当前订单内容 + 指定的行改动，组成一次整张保存的请求体。 */
    private CustomerOrderController.SaveOrderRequest saveRequest(Customer c, String orderId,
                                                                 List<CustomerOrderController.LineRequest> lines)
            throws Exception {
        JsonNode order = get("/customer/orders/" + orderId, c.token()).path("data");
        JsonNode s = order.path("shipTo");
        CustomerOrderController.ShipToFields shipTo = order.has("shipTo")
                ? new CustomerOrderController.ShipToFields(s.path("country").asText(), s.path("company").asText(),
                        s.path("contact").asText(), s.path("phone").asText(), s.path("line1").asText(),
                        textOrNull(s, "line2"), s.path("city").asText(), textOrNull(s, "region"),
                        textOrNull(s, "postalCode"))
                : null;
        return new CustomerOrderController.SaveOrderRequest(textOrNull(order, "title"),
                order.has("wantedDate") ? LocalDate.parse(order.path("wantedDate").asText()) : null, shipTo, lines);
    }

    /** 已有的行全部保留，再加一行；返回新加的那一行。 */
    private JsonNode addLine(Customer c, String orderId, String code, String name, int quantity) throws Exception {
        List<CustomerOrderController.LineRequest> lines = new ArrayList<>();
        get("/customer/orders/" + orderId, c.token()).path("data").path("lines").forEach(l -> lines.add(keep(l)));
        lines.add(newLine(code, name, quantity));
        JsonNode saved = save(c, orderId, saveRequest(c, orderId, lines));
        return lineById(saved.path("order"), saved.path("createdLineIds").get(0).asText());
    }

    private JsonNode save(Customer c, String orderId, CustomerOrderController.SaveOrderRequest request)
            throws Exception {
        ResponseEntity<String> res = rawPut("/customer/orders/" + orderId, request, c.token());
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
        return json.readTree(res.getBody()).path("data");
    }

    private static JsonNode lineById(JsonNode order, String lineId) {
        for (JsonNode l : order.path("lines")) {
            if (l.path("id").asText().equals(lineId)) {
                return l;
            }
        }
        throw new AssertionError("line " + lineId + " not in " + order);
    }

    /** 往这一行当前挂的版本传一个真 PDF 并 complete。 */
    private UUID uploadPdf(Customer c, JsonNode line) throws Exception {
        String partId = line.path("partId").asText();
        String revId = line.path("revision").path("id").asText();
        JsonNode ticket = post("/customer/parts/" + partId + "/revisions/" + revId + "/files",
                new CustomerPartController.RequestUploadRequest("drawing.pdf", "application/pdf"), c.token());
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        assertThat(rest.exchange(url(ticket.path("data").path("uploadUrl").asText()), HttpMethod.PUT,
                new HttpEntity<>(PDF, headers), String.class).getStatusCode().value()).isEqualTo(200);
        JsonNode done = post("/customer/uploads/" + ticket.path("data").path("uploadId").asText() + "/complete",
                null, c.token()).path("data");
        assertThat(done.path("uploadStatus").asText()).isEqualTo("COMPLETED");
        return UUID.fromString(done.path("id").asText());
    }

    private String orderStatus(String orderId) {
        return jdbc.queryForObject("select status from customer_order where id = ?", String.class, UUID.fromString(orderId));
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

    private ResponseEntity<String> rawPut(String path, Object body, String bearer) {
        return exchange(path, HttpMethod.PUT, body, bearer);
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
