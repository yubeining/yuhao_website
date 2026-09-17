package com.mfg.domain.quote;

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
 * 人工报价端到端：客户提交订单 → 运营设加成率、逐行填原价、发出 → 客户看价 → 确认 / 拒绝 → 运营重报。
 *
 * <p>真 Tomcat + 真过滤链 + 真 PostgreSQL + 真 Redis；汇率表每个用例前预置一批 ECB 数据。
 *
 * <p>钉死的业务规则（2026-09-17 需求方拍板，设计文档 13）：
 * <ul>
 *   <li>对客价 = 原价 × 汇率 × 客户加成率；加成率 1.2 = 乘 1.2；对客单价取 2 位，小计 = 单价 × 数量。</li>
 *   <li>客户点确认那一刻才锁汇率，之前随最新汇率变；客户看不到原价、加成率、汇率数字。</li>
 *   <li>客户可拒绝（单回到待报价），运营可在确认前重报，每次留一版；不设有效期。</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class QuoteFlowIT {

    private static final byte[] PDF =
            "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n".getBytes(StandardCharsets.US_ASCII);
    private static final LocalDate DAY1 = LocalDate.of(2026, 9, 16);
    private static final LocalDate DAY2 = LocalDate.of(2026, 9, 17);

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

    /** 清 Redis（注册接口按 IP 限流，见 CustomerOrderFlowIT）；汇率表重置成已知的一批。 */
    @BeforeEach
    void reset() {
        redis.execute((RedisConnection c) -> {
            c.serverCommands().flushDb();
            return null;
        });
        jdbc.update("delete from fx_rate");
        insertEcbBatch(DAY1, "7.7380", "1.1000", "0.8500");
    }

    // ---------- 发出 → 客户看价 ----------

    @Test
    void sendingAQuoteMarksTheOrderQuotedAndTheCustomerSeesOnlyTheirPrices() throws Exception {
        Customer c = register("send");
        Order o = submittedOrder(c, 3, 7);
        String ops = opsToken();
        setMarkup(ops, c.orgId(), "1.2");

        JsonNode sent = sendQuote(ops, o, "EUR", 25, "100.00", "1000.00");
        assertThat(sent.path("versionNo").asInt()).isEqualTo(1);
        assertThat(sent.path("status").asText()).isEqualTo("SENT");
        assertThat(get("/customer/orders/" + o.id(), c.token()).path("data").path("status").asText())
                .isEqualTo("QUOTED");

        ResponseEntity<String> raw = rawGet("/customer/orders/" + o.id() + "/quote", c.token());
        assertThat(raw.getStatusCode().value()).as(raw.getBody()).isEqualTo(200);
        JsonNode q = json.readTree(raw.getBody()).path("data");
        assertThat(q.path("status").asText()).isEqualTo("SENT");
        assertThat(q.path("currency").asText()).isEqualTo("EUR");
        assertThat(q.path("leadDays").asInt()).isEqualTo(25);
        assertThat(q.path("rateDate").asText()).isEqualTo("2026-09-16");
        assertThat(q.path("priceLocked").asBoolean()).isFalse();
        // 100 × 1.2 / 7.738 = 15.5078 → 15.51；1000 × 1.2 / 7.738 = 155.0788 → 155.08
        assertThat(q.path("lines").get(0).path("unitPrice").decimalValue()).isEqualByComparingTo("15.51");
        assertThat(q.path("lines").get(0).path("quantity").asInt()).isEqualTo(3);
        assertThat(q.path("lines").get(0).path("lineTotal").decimalValue()).isEqualByComparingTo("46.53");
        assertThat(q.path("lines").get(1).path("unitPrice").decimalValue()).isEqualByComparingTo("155.08");
        assertThat(q.path("lines").get(1).path("lineTotal").decimalValue()).isEqualByComparingTo("1085.56");
        assertThat(q.path("total").decimalValue()).isEqualByComparingTo("1132.09");
        // 原价、加成率、汇率数字都不给客户（2026-09-17 拍板）
        assertThat(raw.getBody()).doesNotContain("unitPriceCny", "markup", "7.738", "fxEur", "100.00");

        JsonNode list = get("/customer/quotes", c.token()).path("data");
        assertThat(list.path("total").asInt()).isEqualTo(1);
        assertThat(list.path("items").get(0).path("orderId").asText()).isEqualTo(o.id());
        assertThat(list.path("items").get(0).path("total").decimalValue()).isEqualByComparingTo("1132.09");
    }

    @Test
    void eachCurrencyIsPricedFromTheSameEcbBatch() throws Exception {
        Customer c = register("ccy");
        Order o = submittedOrder(c, 1);
        String ops = opsToken();
        setMarkup(ops, c.orgId(), "0.9");

        // 100 × 0.9 × 1.1 / 7.738 = 12.794 → 12.79
        sendQuote(ops, o, "USD", 10, "100.00");
        assertThat(customerQuote(c, o).path("total").decimalValue()).isEqualByComparingTo("12.79");
        // 100 × 0.9 × 0.85 / 7.738 = 9.886 → 9.89
        sendQuote(ops, o, "GBP", 10, "100.00");
        assertThat(customerQuote(c, o).path("total").decimalValue()).isEqualByComparingTo("9.89");
        // CNY：就是 原价 × 加成率
        sendQuote(ops, o, "CNY", 10, "100.00");
        assertThat(customerQuote(c, o).path("total").decimalValue()).isEqualByComparingTo("90.00");
    }

    @Test
    void beforeConfirmingThePriceFollowsTheLatestRate() throws Exception {
        Customer c = register("float");
        Order o = submittedOrder(c, 1);
        String ops = opsToken();
        setMarkup(ops, c.orgId(), "1.2");
        sendQuote(ops, o, "EUR", 25, "100.00");

        insertEcbBatch(DAY2, "7.0000", "1.1000", "0.8500");
        JsonNode q = customerQuote(c, o);
        assertThat(q.path("rateDate").asText()).isEqualTo("2026-09-17");
        // 100 × 1.2 / 7 = 17.142 → 17.14
        assertThat(q.path("total").decimalValue()).isEqualByComparingTo("17.14");
    }

    @Test
    void theMarkupIsTakenWhenTheQuoteIsSent() throws Exception {
        Customer c = register("markup-snap");
        Order o = submittedOrder(c, 1);
        String ops = opsToken();
        setMarkup(ops, c.orgId(), "1.2");
        sendQuote(ops, o, "EUR", 25, "100.00");

        setMarkup(ops, c.orgId(), "2");
        assertThat(customerQuote(c, o).path("total").decimalValue()).isEqualByComparingTo("15.51");
    }

    // ---------- 确认 ----------

    @Test
    void confirmingLocksTheRateAndThePrices() throws Exception {
        Customer c = register("confirm");
        Order o = submittedOrder(c, 3, 7);
        String ops = opsToken();
        setMarkup(ops, c.orgId(), "1.2");
        String quoteId = sendQuote(ops, o, "EUR", 25, "100.00", "1000.00").path("id").asText();

        ResponseEntity<String> res = confirm(c, o, quoteId, DAY1);
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
        JsonNode confirmed = json.readTree(res.getBody()).path("data");
        assertThat(confirmed.path("status").asText()).isEqualTo("CONFIRMED");
        assertThat(confirmed.path("priceLocked").asBoolean()).isTrue();
        assertThat(confirmed.path("total").decimalValue()).isEqualByComparingTo("1132.09");
        assertThat(get("/customer/orders/" + o.id(), c.token()).path("data").path("status").asText())
                .isEqualTo("CONFIRMED");

        Map<String, Object> row = jdbc.queryForMap("select * from quote where id = ?", UUID.fromString(quoteId));
        assertThat(row.get("fx_source")).isEqualTo("ECB");
        assertThat((BigDecimal) row.get("fx_eur_cny")).isEqualByComparingTo("7.7380");
        assertThat((BigDecimal) row.get("fx_eur_quote")).isEqualByComparingTo("1");
        assertThat((BigDecimal) row.get("total_amount")).isEqualByComparingTo("1132.09");
        assertThat(row.get("confirmed_by_user_id")).isEqualTo(c.userId());

        // 之后改加成率、来了新汇率，确认价都不变（CLAUDE.md §10 C2）
        setMarkup(ops, c.orgId(), "3");
        insertEcbBatch(DAY2, "7.0000", "1.1000", "0.8500");
        JsonNode after = customerQuote(c, o);
        assertThat(after.path("rateDate").asText()).isEqualTo("2026-09-16");
        assertThat(after.path("total").decimalValue()).isEqualByComparingTo("1132.09");
        assertThat(after.path("lines").get(1).path("unitPrice").decimalValue()).isEqualByComparingTo("155.08");

        JsonNode opsView = opsQuotes(ops, o).get(0);
        assertThat(opsView.path("status").asText()).isEqualTo("CONFIRMED");
        assertThat(opsView.path("fxEurCny").decimalValue()).isEqualByComparingTo("7.7380");
        assertThat(opsView.path("total").decimalValue()).isEqualByComparingTo("1132.09");

        // 确认过的单不能再报，也不能再确认 / 拒绝
        assertConflict(rawPost("/ops/customer-orders/" + o.id() + "/quotes",
                sendRequest(o, "EUR", 25, "1.00", "1.00"), ops), "order.not_quotable");
        assertConflict(confirm(c, o, quoteId, DAY2), "quote.not_open");
        assertConflict(reject(c, o, quoteId), "quote.not_open");
    }

    /** 客户看到的是旧汇率的价，点确认前汇率更新了：不许按客户没看过的价成交。 */
    @Test
    void confirmingAPriceTheCustomerDidNotSeeIsRefused() throws Exception {
        Customer c = register("stale");
        Order o = submittedOrder(c, 1);
        String ops = opsToken();
        setMarkup(ops, c.orgId(), "1.2");
        String quoteId = sendQuote(ops, o, "EUR", 25, "100.00").path("id").asText();

        insertEcbBatch(DAY2, "7.0000", "1.1000", "0.8500");
        assertConflict(confirm(c, o, quoteId, DAY1), "quote.price_changed");
        assertThat(orderStatus(o)).isEqualTo("QUOTED");

        assertThat(confirm(c, o, quoteId, DAY2).getStatusCode().value()).isEqualTo(200);
        assertThat(customerQuote(c, o).path("total").decimalValue()).isEqualByComparingTo("17.14");
    }

    @Test
    void withoutExchangeRatesThePriceCannotBeShownOrConfirmed() throws Exception {
        Customer c = register("nofx");
        Order o = submittedOrder(c, 1);
        String ops = opsToken();
        setMarkup(ops, c.orgId(), "1.2");
        String quoteId = sendQuote(ops, o, "EUR", 25, "100.00").path("id").asText();

        jdbc.update("delete from fx_rate");
        ResponseEntity<String> view = rawGet("/customer/orders/" + o.id() + "/quote", c.token());
        assertThat(view.getStatusCode().value()).as(view.getBody()).isEqualTo(503);
        assertThat(messageOf(view)).isEqualTo("quote.fx_unavailable");
        ResponseEntity<String> res = confirm(c, o, quoteId, DAY1);
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(503);
        assertThat(orderStatus(o)).isEqualTo("QUOTED");
    }

    // ---------- 重报 / 拒绝 ----------

    @Test
    void resendingKeepsTheOldVersionAndOnlyTheNewOneCanBeConfirmed() throws Exception {
        Customer c = register("resend");
        Order o = submittedOrder(c, 1);
        String ops = opsToken();
        setMarkup(ops, c.orgId(), "1.2");
        String v1 = sendQuote(ops, o, "EUR", 25, "100.00").path("id").asText();
        JsonNode v2 = sendQuote(ops, o, "EUR", 20, "200.00");
        assertThat(v2.path("versionNo").asInt()).isEqualTo(2);

        JsonNode versions = opsQuotes(ops, o);
        assertThat(versions).hasSize(2);
        assertThat(versions.get(0).path("versionNo").asInt()).isEqualTo(2);
        assertThat(versions.get(0).path("status").asText()).isEqualTo("SENT");
        assertThat(versions.get(0).path("lines").get(0).path("unitPriceCny").decimalValue())
                .isEqualByComparingTo("200.00");
        assertThat(versions.get(1).path("status").asText()).isEqualTo("SUPERSEDED");
        assertThat(versions.get(1).path("lines").get(0).path("unitPriceCny").decimalValue())
                .isEqualByComparingTo("100.00");

        JsonNode q = customerQuote(c, o);
        assertThat(q.path("id").asText()).isEqualTo(v2.path("id").asText());
        assertThat(q.path("leadDays").asInt()).isEqualTo(20);
        assertConflict(confirm(c, o, v1, DAY1), "quote.not_open");
        assertThat(confirm(c, o, v2.path("id").asText(), DAY1).getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void rejectingSendsTheOrderBackForAnotherQuote() throws Exception {
        Customer c = register("reject");
        Order o = submittedOrder(c, 1);
        String ops = opsToken();
        setMarkup(ops, c.orgId(), "1.2");
        String v1 = sendQuote(ops, o, "EUR", 25, "100.00").path("id").asText();

        ResponseEntity<String> res = reject(c, o, v1);
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
        assertThat(orderStatus(o)).isEqualTo("SUBMITTED");
        assertThat(jdbc.queryForObject("select status from quote where id = ?", String.class, UUID.fromString(v1)))
                .isEqualTo("REJECTED");
        assertThat(rawGet("/customer/orders/" + o.id() + "/quote", c.token()).getStatusCode().value()).isEqualTo(404);
        assertConflict(confirm(c, o, v1, DAY1), "quote.not_open");

        JsonNode v2 = sendQuote(ops, o, "EUR", 25, "90.00");
        assertThat(v2.path("versionNo").asInt()).isEqualTo(2);
        assertThat(orderStatus(o)).isEqualTo("QUOTED");
        assertThat(opsQuotes(ops, o).get(1).path("status").asText()).isEqualTo("REJECTED");
    }

    // ---------- 运营发报价的校验 ----------

    @Test
    void aCustomerWithoutAMarkupCannotBeQuoted() throws Exception {
        Customer c = register("nomarkup");
        Order o = submittedOrder(c, 1);
        String ops = opsToken();
        assertThat(get("/ops/customers/" + c.orgId() + "/markup", ops).path("data").has("markupRate")).isFalse();
        assertConflict(rawPost("/ops/customer-orders/" + o.id() + "/quotes",
                sendRequest(o, "EUR", 25, "100.00"), ops), "quote.markup_missing");
        assertThat(orderStatus(o)).isEqualTo("SUBMITTED");
    }

    @Test
    void theQuoteMustPriceEveryLineOfTheOrderExactlyOnce() throws Exception {
        Customer c = register("lines");
        Order o = submittedOrder(c, 1, 2);
        Order other = submittedOrder(c, 1);
        String ops = opsToken();
        setMarkup(ops, c.orgId(), "1.2");
        String path = "/ops/customer-orders/" + o.id() + "/quotes";
        BigDecimal p = new BigDecimal("10.00");

        List<SendQuoteBody> bad = List.of(
                body("EUR", 25, List.of(new LineBody(o.lineIds().get(0), p))),
                body("EUR", 25, List.of(new LineBody(o.lineIds().get(0), p), new LineBody(o.lineIds().get(1), p),
                        new LineBody(UUID.randomUUID(), p))),
                body("EUR", 25, List.of(new LineBody(o.lineIds().get(0), p), new LineBody(o.lineIds().get(0), p))),
                body("EUR", 25, List.of(new LineBody(o.lineIds().get(0), p), new LineBody(other.lineIds().get(0), p))));
        for (SendQuoteBody b : bad) {
            ResponseEntity<String> res = rawPost(path, b, ops);
            assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(400);
            assertThat(messageOf(res)).isEqualTo("quote.lines_mismatch");
        }
        assertThat(orderStatus(o)).isEqualTo("SUBMITTED");
        assertThat(jdbc.queryForObject("select count(*) from quote where customer_order_id = ?", Long.class,
                UUID.fromString(o.id()))).isZero();
    }

    @Test
    void malformedQuoteInputIsRejected() throws Exception {
        Customer c = register("malformed");
        Order o = submittedOrder(c, 1);
        String ops = opsToken();
        setMarkup(ops, c.orgId(), "1.2");
        String path = "/ops/customer-orders/" + o.id() + "/quotes";
        String line = o.lineIds().get(0).toString();

        List<Map<String, Object>> bad = List.of(
                Map.of("currency", "JPY", "leadDays", 25, "lines", List.of(Map.of("lineId", line, "unitPriceCny", 10))),
                Map.of("currency", "EUR", "leadDays", 0, "lines", List.of(Map.of("lineId", line, "unitPriceCny", 10))),
                Map.of("currency", "EUR", "leadDays", 25, "lines", List.of(Map.of("lineId", line, "unitPriceCny", 0))),
                Map.of("currency", "EUR", "leadDays", 25, "lines", List.of(Map.of("lineId", line, "unitPriceCny", -1))),
                Map.of("currency", "EUR", "leadDays", 25,
                        "lines", List.of(Map.of("lineId", line, "unitPriceCny", new BigDecimal("1.234")))),
                Map.of("currency", "EUR", "leadDays", 25, "lines", List.of()),
                Map.of("currency", "EUR", "lines", List.of(Map.of("lineId", line, "unitPriceCny", 10))));
        for (Map<String, Object> b : bad) {
            ResponseEntity<String> res = rawPost(path, b, ops);
            assertThat(res.getStatusCode().value()).as("%s -> %s", b, res.getBody()).isEqualTo(400);
        }
        for (Object rate : List.of(0, -1, new BigDecimal("1.23456"))) {
            ResponseEntity<String> res = rawPut("/ops/customers/" + c.orgId() + "/markup", Map.of("markupRate", rate), ops);
            assertThat(res.getStatusCode().value()).as("%s -> %s", rate, res.getBody()).isEqualTo(400);
        }
        assertThat(orderStatus(o)).isEqualTo("SUBMITTED");
    }

    @Test
    void draftsAreInvisibleToOperatorsAndOnlySubmittedOrQuotedOrdersCanBeQuoted() throws Exception {
        Customer c = register("draft");
        String ops = opsToken();
        setMarkup(ops, c.orgId(), "1.2");
        String draftId = createOrder(c);
        JsonNode line = addLine(c, draftId, uniqueCode(), 1);

        assertThat(rawGet("/ops/customer-orders/" + draftId, ops).getStatusCode().value()).isEqualTo(404);
        ResponseEntity<String> res = rawPost("/ops/customer-orders/" + draftId + "/quotes",
                body("EUR", 25, List.of(new LineBody(UUID.fromString(line.path("id").asText()), BigDecimal.TEN))), ops);
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(404);
        assertThat(rawPost("/ops/customer-orders/" + UUID.randomUUID() + "/quotes",
                body("EUR", 25, List.of(new LineBody(UUID.randomUUID(), BigDecimal.TEN))), ops)
                .getStatusCode().value()).isEqualTo(404);
        assertThat(rawPut("/ops/customers/" + UUID.randomUUID() + "/markup",
                new MarkupBody(BigDecimal.ONE), ops).getStatusCode().value()).isEqualTo(404);
    }

    @Test
    void previewPricesTheLinesWithoutSendingAnything() throws Exception {
        Customer c = register("preview");
        Order o = submittedOrder(c, 3);
        String ops = opsToken();
        setMarkup(ops, c.orgId(), "1.2");

        ResponseEntity<String> res = rawPost("/ops/customer-orders/" + o.id() + "/quotes/preview",
                sendRequest(o, "EUR", 25, "100.00"), ops);
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
        JsonNode p = json.readTree(res.getBody()).path("data");
        assertThat(p.path("rateDate").asText()).isEqualTo("2026-09-16");
        assertThat(p.path("markupRate").decimalValue()).isEqualByComparingTo("1.2");
        assertThat(p.path("fxEurCny").decimalValue()).isEqualByComparingTo("7.7380");
        assertThat(p.path("lines").get(0).path("unitPrice").decimalValue()).isEqualByComparingTo("15.51");
        assertThat(p.path("total").decimalValue()).isEqualByComparingTo("46.53");
        assertThat(orderStatus(o)).isEqualTo("SUBMITTED");
        assertThat(jdbc.queryForObject("select count(*) from quote where customer_order_id = ?", Long.class,
                UUID.fromString(o.id()))).isZero();
    }

    // ---------- 运营看单、看图 ----------

    @Test
    void operatorsSeeSubmittedOrdersFromAllCustomersAndCanViewTheirDrawings() throws Exception {
        Customer c = register("opsview");
        Order o = submittedOrder(c, 5);
        String draftId = createOrder(c);
        String ops = opsToken();

        JsonNode page = get("/ops/customer-orders?status=SUBMITTED&pageSize=100", ops).path("data");
        List<String> ids = new ArrayList<>();
        page.path("items").forEach(n -> ids.add(n.path("id").asText()));
        assertThat(ids).contains(o.id()).doesNotContain(draftId);
        JsonNode mine = findById(page.path("items"), o.id());
        assertThat(mine.path("customerOrgId").asText()).isEqualTo(c.orgId().toString());
        assertThat(mine.path("customerName").asText()).isEqualTo("Acme opsview");
        assertThat(mine.path("totalQuantity").asInt()).isEqualTo(5);

        JsonNode detail = get("/ops/customer-orders/" + o.id(), ops).path("data");
        assertThat(detail.path("status").asText()).isEqualTo("SUBMITTED");
        JsonNode line = detail.path("lines").get(0);
        String fileId = line.path("revision").path("files").get(0).path("id").asText();
        assertThat(fileId).isEqualTo(o.fileIds().get(0).toString());

        ResponseEntity<String> url = rawGet("/ops/customer-orders/" + o.id() + "/lines/" + line.path("id").asText()
                + "/files/" + fileId + "/view-url", ops);
        assertThat(url.getStatusCode().value()).as(url.getBody()).isEqualTo(200);
        Map<String, Object> log = jdbc.queryForMap("select * from part_file_access_log where part_file_id = ?"
                + " order by id desc limit 1", UUID.fromString(fileId));
        assertThat(log.get("accessor_party_type")).isEqualTo("OPERATOR");
        assertThat(log.get("customer_org_id")).isEqualTo(c.orgId());
        assertThat(log.get("context_type")).isEqualTo("CUSTOMER_ORDER");
        assertThat(log.get("context_id")).isEqualTo(UUID.fromString(o.id()));

        // 文件不属于这一行 → 404，不落审计
        Order other = submittedOrder(c, 1);
        long before = jdbc.queryForObject("select count(*) from part_file_access_log", Long.class);
        assertThat(rawGet("/ops/customer-orders/" + o.id() + "/lines/" + line.path("id").asText()
                + "/files/" + other.fileIds().get(0) + "/view-url", ops).getStatusCode().value()).isEqualTo(404);
        assertThat(jdbc.queryForObject("select count(*) from part_file_access_log", Long.class)).isEqualTo(before);
    }

    // ---------- 越权 ----------

    @Test
    void customersOnlyReachTheirOwnQuotesAndNeverTheOperatorEndpoints() throws Exception {
        Customer a = register("owner");
        Customer b = register("intruder");
        Order o = submittedOrder(a, 1);
        String ops = opsToken();
        setMarkup(ops, a.orgId(), "1.2");
        String quoteId = sendQuote(ops, o, "EUR", 25, "100.00").path("id").asText();

        assertThat(rawGet("/customer/orders/" + o.id() + "/quote", b.token()).getStatusCode().value()).isEqualTo(404);
        assertThat(confirm(b, o, quoteId, DAY1).getStatusCode().value()).isEqualTo(404);
        assertThat(reject(b, o, quoteId).getStatusCode().value()).isEqualTo(404);
        assertThat(get("/customer/quotes", b.token()).path("data").path("total").asInt()).isZero();
        assertThat(orderStatus(o)).isEqualTo("QUOTED");

        assertThat(rawGet("/ops/customer-orders", a.token()).getStatusCode().value()).isEqualTo(403);
        assertThat(rawGet("/ops/customer-orders/" + o.id() + "/quotes", a.token()).getStatusCode().value()).isEqualTo(403);
        assertThat(rawPut("/ops/customers/" + a.orgId() + "/markup", new MarkupBody(new BigDecimal("0.1")), a.token())
                .getStatusCode().value()).isEqualTo(403);
        assertThat(rawPost("/ops/customer-orders/" + o.id() + "/quotes", sendRequest(o, "EUR", 25, "0.01"), a.token())
                .getStatusCode().value()).isEqualTo(403);
        assertThat(rawGet("/customer/orders/" + o.id() + "/quote", ops).getStatusCode().value()).isEqualTo(403);
    }

    // ---------- 并发 ----------

    /** 客户确认和运营重报同时发生：只能有一个成功，不能出现「确认了旧版、新版又发出去了」。 */
    @Test
    void confirmingAndResendingAtTheSameTimeNeverBothSucceed() throws Exception {
        Customer c = register("race-resend");
        String ops = opsToken();
        setMarkup(ops, c.orgId(), "1.2");
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int round = 0; round < 30; round++) {
                Order o = submittedOrder(c, 1);
                String quoteId = sendQuote(ops, o, "EUR", 25, "100.00").path("id").asText();
                CyclicBarrier go = new CyclicBarrier(2);
                Future<ResponseEntity<String>> confirm = pool.submit(() -> {
                    go.await();
                    return confirm(c, o, quoteId, DAY1);
                });
                Future<ResponseEntity<String>> resend = pool.submit(() -> {
                    go.await();
                    return rawPost("/ops/customer-orders/" + o.id() + "/quotes", sendRequest(o, "EUR", 25, "200.00"), ops);
                });
                int cs = confirm.get().getStatusCode().value();
                int rs = resend.get().getStatusCode().value();
                assertThat(List.of(cs, rs)).as("round %d", round).containsExactlyInAnyOrder(200, 409);
                String expected = cs == 200 ? "CONFIRMED" : "QUOTED";
                assertThat(orderStatus(o)).as("round %d", round).isEqualTo(expected);
                assertThat(jdbc.queryForObject("select count(*) from quote where customer_order_id = ?"
                        + " and status in ('SENT', 'CONFIRMED')", Long.class, UUID.fromString(o.id())))
                        .as("round %d", round).isEqualTo(1);
            }
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void confirmingAndRejectingAtTheSameTimeNeverBothSucceed() throws Exception {
        Customer c = register("race-reject");
        String ops = opsToken();
        setMarkup(ops, c.orgId(), "1.2");
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int round = 0; round < 30; round++) {
                Order o = submittedOrder(c, 1);
                String quoteId = sendQuote(ops, o, "EUR", 25, "100.00").path("id").asText();
                CyclicBarrier go = new CyclicBarrier(2);
                Future<ResponseEntity<String>> confirm = pool.submit(() -> {
                    go.await();
                    return confirm(c, o, quoteId, DAY1);
                });
                Future<ResponseEntity<String>> reject = pool.submit(() -> {
                    go.await();
                    return reject(c, o, quoteId);
                });
                int cs = confirm.get().getStatusCode().value();
                int rs = reject.get().getStatusCode().value();
                assertThat(List.of(cs, rs)).as("round %d", round).containsExactlyInAnyOrder(200, 409);
                assertThat(orderStatus(o)).as("round %d", round).isEqualTo(cs == 200 ? "CONFIRMED" : "SUBMITTED");
            }
        } finally {
            pool.shutdownNow();
        }
    }

    // ---------- 场景搭建 ----------

    private record Customer(String token, UUID orgId, UUID userId) {
    }

    private record Order(String id, List<UUID> lineIds, List<UUID> fileIds) {
    }

    /** 请求体用 record 构造、走项目 ObjectMapper 序列化（CLAUDE.md §9）。字段名对齐接口。 */
    private record OrderDraftBody(String title, Integer wantedLeadDays) {
    }

    private record AddLineBody(String code, String name, int quantity) {
    }

    private record UploadBody(String filename, String contentType) {
    }

    private record LineBody(UUID lineId, BigDecimal unitPriceCny) {
    }

    private record SendQuoteBody(String currency, Integer leadDays, List<LineBody> lines) {
    }

    private record MarkupBody(BigDecimal markupRate) {
    }

    private record ConfirmBody(UUID quoteId, LocalDate rateDate) {
    }

    private record RejectBody(UUID quoteId) {
    }

    private void insertEcbBatch(LocalDate day, String cny, String usd, String gbp) {
        for (String[] pair : new String[][] {{"CNY", cny}, {"USD", usd}, {"GBP", gbp}, {"JPY", "160.00"}}) {
            jdbc.update("insert into fx_rate (source, rate_date, base_currency, quote_currency, rate, fetched_at)"
                    + " values ('ECB', ?, 'EUR', ?, ?, now())", day, pair[0], new BigDecimal(pair[1]));
        }
    }

    private Customer register(String tag) throws Exception {
        String email = "quote-" + tag + "-" + UUID.randomUUID() + "@example.com";
        JsonNode reg = post("/auth/register",
                new RegisterRequest(PartyType.CUSTOMER, "Acme " + tag, "DE", email, "password123", "Alice"), null);
        String token = post("/auth/login",
                new ExternalAuthController.ExternalLoginRequest(email, "password123"), null)
                .path("data").path("accessToken").asText();
        return new Customer(token,
                UUID.fromString(reg.path("data").path("orgId").asText()),
                UUID.fromString(reg.path("data").path("id").asText()));
    }

    private String opsToken() throws Exception {
        String email = "quote-ops-" + UUID.randomUUID() + "@example.com";
        Organization internal = organizations.save(new Organization(Organization.Type.INTERNAL, "HQ quote", null));
        opsUsers.save(new OpsUser(internal.getId(), email, "Ops", passwordEncoder.encode("password123")));
        return post("/auth/internal/login", new OpsAuthController.OpsLoginRequest(email, "password123"), null)
                .path("data").path("accessToken").asText();
    }

    private String createOrder(Customer c) throws Exception {
        return post("/customer/orders", new OrderDraftBody(null, null), c.token()).path("data").path("id").asText();
    }

    private JsonNode addLine(Customer c, String orderId, String code, int quantity) throws Exception {
        ResponseEntity<String> res = rawPost("/customer/orders/" + orderId + "/lines",
                new AddLineBody(code, "Part " + code, quantity), c.token());
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
        return json.readTree(res.getBody()).path("data");
    }

    /** 建一张已提交的订单，每个数量一行，每行一份真 PDF。 */
    private Order submittedOrder(Customer c, int... quantities) throws Exception {
        String orderId = createOrder(c);
        List<UUID> lineIds = new ArrayList<>();
        List<UUID> fileIds = new ArrayList<>();
        for (int q : quantities) {
            JsonNode line = addLine(c, orderId, uniqueCode(), q);
            lineIds.add(UUID.fromString(line.path("id").asText()));
            fileIds.add(uploadPdf(c, line));
        }
        ResponseEntity<String> res = rawPost("/customer/orders/" + orderId + "/submit", null, c.token());
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
        return new Order(orderId, lineIds, fileIds);
    }

    private UUID uploadPdf(Customer c, JsonNode line) throws Exception {
        String partId = line.path("partId").asText();
        String revId = line.path("revision").path("id").asText();
        JsonNode ticket = post("/customer/parts/" + partId + "/revisions/" + revId + "/files",
                new UploadBody("drawing.pdf", "application/pdf"), c.token());
        UUID fileId = UUID.fromString(ticket.path("data").path("fileId").asText());
        String key = jdbc.queryForObject("select storage_key from part_file where id = ?", String.class, fileId);
        storage.put(key, new ByteArrayInputStream(PDF), PDF.length, "application/pdf");
        assertThat(post("/customer/files/" + fileId + "/complete", null, c.token())
                .path("data").path("uploadStatus").asText()).isEqualTo("COMPLETED");
        return fileId;
    }

    private void setMarkup(String ops, UUID orgId, String rate) throws Exception {
        ResponseEntity<String> res = rawPut("/ops/customers/" + orgId + "/markup", new MarkupBody(new BigDecimal(rate)), ops);
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
        assertThat(json.readTree(res.getBody()).path("data").path("markupRate").decimalValue())
                .isEqualByComparingTo(rate);
    }

    private static SendQuoteBody body(String currency, Integer leadDays, List<LineBody> lines) {
        return new SendQuoteBody(currency, leadDays, lines);
    }

    /** 按订单行顺序依次给单价。 */
    private static SendQuoteBody sendRequest(Order o, String currency, int leadDays, String... unitPricesCny) {
        List<LineBody> lines = new ArrayList<>();
        for (int i = 0; i < unitPricesCny.length; i++) {
            lines.add(new LineBody(o.lineIds().get(i), new BigDecimal(unitPricesCny[i])));
        }
        return body(currency, leadDays, lines);
    }

    private JsonNode sendQuote(String ops, Order o, String currency, int leadDays, String... unitPricesCny)
            throws Exception {
        ResponseEntity<String> res = rawPost("/ops/customer-orders/" + o.id() + "/quotes",
                sendRequest(o, currency, leadDays, unitPricesCny), ops);
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
        return json.readTree(res.getBody()).path("data");
    }

    private JsonNode opsQuotes(String ops, Order o) throws Exception {
        return get("/ops/customer-orders/" + o.id() + "/quotes", ops).path("data");
    }

    private JsonNode customerQuote(Customer c, Order o) throws Exception {
        ResponseEntity<String> res = rawGet("/customer/orders/" + o.id() + "/quote", c.token());
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(200);
        return json.readTree(res.getBody()).path("data");
    }

    private ResponseEntity<String> confirm(Customer c, Order o, String quoteId, LocalDate rateDate) {
        return rawPost("/customer/orders/" + o.id() + "/quote/confirm",
                new ConfirmBody(UUID.fromString(quoteId), rateDate), c.token());
    }

    private ResponseEntity<String> reject(Customer c, Order o, String quoteId) {
        return rawPost("/customer/orders/" + o.id() + "/quote/reject", new RejectBody(UUID.fromString(quoteId)),
                c.token());
    }

    private String orderStatus(Order o) {
        return jdbc.queryForObject("select status from customer_order where id = ?", String.class,
                UUID.fromString(o.id()));
    }

    private static JsonNode findById(JsonNode items, String id) {
        for (JsonNode n : items) {
            if (n.path("id").asText().equals(id)) {
                return n;
            }
        }
        throw new AssertionError("not in page: " + id);
    }

    private static String uniqueCode() {
        return "QT-" + UUID.randomUUID().toString().substring(0, 8);
    }

    private void assertConflict(ResponseEntity<String> res, String code) throws Exception {
        assertThat(res.getStatusCode().value()).as(res.getBody()).isEqualTo(409);
        assertThat(messageOf(res)).isEqualTo(code);
    }

    // ---------- HTTP helpers ----------

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
        return rest.exchange(url(path), method, new HttpEntity<>(body, headers), String.class);
    }

    private String messageOf(ResponseEntity<String> res) throws Exception {
        return json.readTree(res.getBody()).path("message").asText();
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }
}
