package com.mfg.platform.fx;

import com.mfg.common.cache.CacheKeys;
import com.mfg.common.security.PartyType;
import com.mfg.common.service.RedisService;
import com.mfg.platform.auth.ExternalAuthController;
import com.mfg.platform.auth.OpsAuthController;
import com.mfg.platform.identity.OpsUser;
import com.mfg.platform.identity.OpsUserRepository;
import com.mfg.platform.identity.Organization;
import com.mfg.platform.identity.OrganizationRepository;
import com.mfg.platform.identity.dto.RegisterRequest;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ECB 汇率同步端到端：假 ECB（JDK 自带 HttpServer，不连外网）→ 拉取 → 解析 → 入库 → 运营端查询。
 *
 * <p>真 PostgreSQL + 真 Redis（锁是真 Redis 锁）。测试 profile 里定时任务是关的（{@code app.fx.enabled=false}），
 * 这里直接调 {@link FxRateSyncJob#syncOnce()}，不等调度。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class FxRateSyncIT {

    /** 假 ECB 这一刻要回什么。 */
    private record Upstream(int status, String body, long delayMillis) {
    }

    private static final AtomicReference<Upstream> UPSTREAM = new AtomicReference<>();
    private static final AtomicInteger HITS = new AtomicInteger();
    private static HttpServer fakeEcb;

    @BeforeAll
    static void startFakeEcb() throws IOException {
        fakeEcb = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        fakeEcb.createContext("/eurofxref-daily.xml", exchange -> {
            HITS.incrementAndGet();
            Upstream u = UPSTREAM.get();
            try {
                if (u.delayMillis() > 0) {
                    Thread.sleep(u.delayMillis());
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            byte[] bytes = u.body().getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(u.status(), bytes.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            } catch (IOException ignored) {
                // 客户端超时先断开了，写不回去是预期的
            }
        });
        fakeEcb.start();
    }

    @AfterAll
    static void stopFakeEcb() {
        fakeEcb.stop(0);
    }

    @DynamicPropertySource
    static void pointAtFakeEcb(DynamicPropertyRegistry registry) {
        registry.add("app.fx.ecb-daily-url",
                () -> "http://127.0.0.1:" + fakeEcb.getAddress().getPort() + "/eurofxref-daily.xml");
        registry.add("app.fx.request-timeout-seconds", () -> "1");
    }

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    private RedisService redis;

    @Autowired
    private FxRateSyncJob job;

    @Autowired
    private OrganizationRepository organizations;

    @Autowired
    private OpsUserRepository opsUsers;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void reset() throws IOException {
        jdbc.update("delete from fx_rate");
        redisTemplate.execute((RedisConnection c) -> {
            c.serverCommands().flushDb();
            return null;
        });
        HITS.set(0);
        serve(200, resource("fx/ecb-daily-small.xml"), 0);
    }

    // ---------- 同步 ----------

    @Test
    void syncStoresEveryCurrencyOfThatDay() {
        FxRateSyncJob.Outcome outcome = job.syncOnce();

        assertThat(outcome.status()).isEqualTo(FxRateSyncJob.Status.SYNCED);
        assertThat(outcome.inserted()).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from fx_rate", Long.class)).isEqualTo(2);
        BigDecimal cny = jdbc.queryForObject("select rate from fx_rate where source = 'ECB'"
                + " and rate_date = date '2026-09-16' and base_currency = 'EUR' and quote_currency = 'CNY'",
                BigDecimal.class);
        assertThat(cny).isEqualByComparingTo("7.7380");
    }

    /** 同一天反复拉：唯一索引 + ON CONFLICT DO NOTHING，行数不变（CLAUDE.md §8 的 DB 兜底）。 */
    @Test
    void syncingTheSameDayAgainAddsNothing() {
        job.syncOnce();
        FxRateSyncJob.Outcome again = job.syncOnce();

        assertThat(again.status()).isEqualTo(FxRateSyncJob.Status.SYNCED);
        assertThat(again.inserted()).isZero();
        assertThat(jdbc.queryForObject("select count(*) from fx_rate", Long.class)).isEqualTo(2);
    }

    @Test
    void aNewDayAddsANewBatch() {
        job.syncOnce();
        serve(200, dailyXml("2026-09-17", "<Cube currency='USD' rate='1.1600'/><Cube currency='CNY' rate='7.7500'/>"), 0);
        job.syncOnce();

        assertThat(jdbc.queryForObject("select count(*) from fx_rate", Long.class)).isEqualTo(4);
    }

    /** 别的实例正在同步：本次跳过，连 ECB 都不请求。 */
    @Test
    void anotherInstanceHoldingTheLockMeansThisOneSkips() {
        assertThat(redis.tryLock(CacheKeys.schedulerLock("fx-sync", "ECB"), "someone-else", 60)).isTrue();

        FxRateSyncJob.Outcome outcome = job.syncOnce();

        assertThat(outcome.status()).isEqualTo(FxRateSyncJob.Status.SKIPPED_LOCKED);
        assertThat(HITS.get()).isZero();
        assertThat(jdbc.queryForObject("select count(*) from fx_rate", Long.class)).isZero();
    }

    /** 同步完要把锁放掉，否则下一轮要等锁过期。 */
    @Test
    void theLockIsReleasedAfterASync() {
        job.syncOnce();
        assertThat(redis.tryLock(CacheKeys.schedulerLock("fx-sync", "ECB"), "next-run", 60)).isTrue();
    }

    @Test
    void anUpstreamErrorStoresNothingAndDoesNotThrow() {
        serve(500, "maintenance", 0);
        assertFailedWithNothingStored();
    }

    @Test
    void aMalformedDocumentStoresNothingAndDoesNotThrow() {
        serve(200, dailyXml("2026-09-16", "<Cube currency='USD' rate='1.1551'/><Cube currency='CNY' rate='n/a'/>"), 0);
        assertFailedWithNothingStored();
    }

    @Test
    void aSlowUpstreamTimesOutAndStoresNothing() {
        serve(200, dailyXml("2026-09-16", "<Cube currency='CNY' rate='7.7380'/>"), 3000);
        assertFailedWithNothingStored();
    }

    // ---------- 查询 ----------

    @Test
    void operatorsCanReadTheLatestBatch() throws Exception {
        job.syncOnce();
        serve(200, dailyXml("2026-09-17", "<Cube currency='USD' rate='1.1600'/><Cube currency='CNY' rate='7.7500'/>"), 0);
        job.syncOnce();

        JsonNode res = get("/ops/fx-rates/latest", opsToken());
        JsonNode data = res.path("data");
        assertThat(data).hasSize(2);
        for (JsonNode r : data) {
            assertThat(r.path("source").asText()).isEqualTo("ECB");
            assertThat(r.path("rateDate").asText()).isEqualTo("2026-09-17");
            assertThat(r.path("baseCurrency").asText()).isEqualTo("EUR");
            assertThat(r.path("fetchedAt").asText()).isNotBlank();
        }
        JsonNode cny = null;
        for (JsonNode r : data) {
            if ("CNY".equals(r.path("quoteCurrency").asText())) {
                cny = r;
            }
        }
        assertThat(cny).isNotNull();
        assertThat(cny.path("rate").decimalValue()).isEqualByComparingTo("7.7500");
    }

    @Test
    void noRatesYetIsAnEmptyList() throws Exception {
        assertThat(get("/ops/fx-rates/latest", opsToken()).path("data")).isEmpty();
    }

    @Test
    void customersCannotReadTheOpsEndpoint() throws Exception {
        String email = "fx-c-" + UUID.randomUUID() + "@example.com";
        post("/auth/register", new RegisterRequest(PartyType.CUSTOMER, "Fx Co", "DE", email, "password123", "C"), null);
        String token = post("/auth/login", new ExternalAuthController.ExternalLoginRequest(email, "password123"), null)
                .path("data").path("accessToken").asText();

        assertThat(rawGet("/ops/fx-rates/latest", token).getStatusCode().value()).isEqualTo(403);
    }

    // ---------- helpers ----------

    private void assertFailedWithNothingStored() {
        FxRateSyncJob.Outcome outcome = job.syncOnce();
        assertThat(outcome.status()).isEqualTo(FxRateSyncJob.Status.FAILED);
        assertThat(jdbc.queryForObject("select count(*) from fx_rate", Long.class)).isZero();
        // 失败也要放锁
        assertThat(redis.tryLock(CacheKeys.schedulerLock("fx-sync", "ECB"), "after-failure", 60)).isTrue();
    }

    private static void serve(int status, String body, long delayMillis) {
        UPSTREAM.set(new Upstream(status, body, delayMillis));
    }

    private static String dailyXml(String date, String cubes) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                + "<gesmes:Envelope xmlns:gesmes=\"http://www.gesmes.org/xml/2002-08-01\""
                + " xmlns=\"http://www.ecb.int/vocabulary/2002-08-01/eurofxref\">"
                + "<Cube><Cube time='" + date + "'>" + cubes + "</Cube></Cube></gesmes:Envelope>";
    }

    private static String resource(String path) throws IOException {
        try (InputStream in = FxRateSyncIT.class.getClassLoader().getResourceAsStream(path)) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private String opsToken() throws Exception {
        String email = "fx-ops-" + UUID.randomUUID() + "@example.com";
        Organization internal = organizations.save(new Organization(Organization.Type.INTERNAL, "HQ fx", null));
        opsUsers.save(new OpsUser(internal.getId(), email, "Ops", passwordEncoder.encode("password123")));
        return post("/auth/internal/login", new OpsAuthController.OpsLoginRequest(email, "password123"), null)
                .path("data").path("accessToken").asText();
    }

    private JsonNode post(String path, Object body, String bearer) throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) {
            headers.setBearerAuth(bearer);
        }
        return json.readTree(rest.postForEntity(url(path), new HttpEntity<>(body, headers), String.class).getBody());
    }

    private JsonNode get(String path, String bearer) throws Exception {
        return json.readTree(rawGet(path, bearer).getBody());
    }

    private ResponseEntity<String> rawGet(String path, String bearer) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(bearer);
        return rest.exchange(url(path), HttpMethod.GET, new HttpEntity<>(headers), String.class);
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }
}
