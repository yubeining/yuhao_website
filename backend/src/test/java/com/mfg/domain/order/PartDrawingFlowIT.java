package com.mfg.domain.order;

import com.mfg.common.security.PartyType;
import com.mfg.platform.auth.ExternalAuthController;
import com.mfg.platform.identity.dto.RegisterRequest;
import com.mfg.platform.storage.StorageService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
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
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 零件图纸端到端：建零件 → 建版本 → 申请上传 → 字节进存储 → complete → 取查看 URL → 落审计。
 *
 * <p>真 Tomcat + 真过滤链 + 真 PostgreSQL + 真 Redis；存储是 memory 实现（测试 profile），
 * 所以「浏览器直传」在这里用 {@link StorageService#put} 模拟 —— 预签名 URL 本身的真实性
 * 不在本测试范围，由 {@code S3StorageServiceIT} 在有凭据时验。
 *
 * <p>★ 两条红线在这里钉死：
 * <ul>
 *   <li>红线 1（§3 铁律 6）：每签发一次查看 URL 落一行审计；<b>校验不过就不落</b>。</li>
 *   <li>§3 铁律 2：别的客户的零件 / 文件一律 404，而不是 403 —— 不泄露「这个 id 存在」。</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class PartDrawingFlowIT {

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

    // ---------- 零件与版本 ----------

    /** D16：同一客户同一图号 = 同一个零件，不能建第二个。 */
    @Test
    void sameCodeTwiceForOneCustomerIsRejected() throws Exception {
        Customer c = register("dup");
        String code = uniqueCode();
        assertThat(rawPost("/customer/parts", new CustomerPartController.CreatePartRequest(code, "Bracket"), c.token())
                .getStatusCode().value()).isEqualTo(200);

        ResponseEntity<String> again =
                rawPost("/customer/parts", new CustomerPartController.CreatePartRequest(code, "Bracket v2"), c.token());
        assertThat(again.getStatusCode().value()).isEqualTo(409);
        assertThat(messageOf(again)).isEqualTo("part.code_taken");
    }

    /** 版本号我方编，每个零件从 1 开始（2026-09-10 拍板）。 */
    @Test
    void revisionsAreNumberedFromOnePerPart() throws Exception {
        Customer c = register("rev");
        UUID partId = createPart(c);

        JsonNode first = post(revisionsPath(partId), new CustomerPartController.CreateRevisionRequest("A"), c.token());
        assertThat(first.path("data").path("revNo").asInt()).isEqualTo(1);
        assertThat(first.path("data").path("customerRev").asText()).isEqualTo("A");

        JsonNode second = post(revisionsPath(partId), new CustomerPartController.CreateRevisionRequest(null), c.token());
        assertThat(second.path("data").path("revNo").asInt()).isEqualTo(2);
    }

    @Test
    void anotherCustomerCannotAddRevisionToSomeoneElsesPart() throws Exception {
        Customer owner = register("owner");
        Customer other = register("other");
        UUID partId = createPart(owner);

        ResponseEntity<String> res =
                rawPost(revisionsPath(partId), new CustomerPartController.CreateRevisionRequest(null), other.token());
        assertThat(res.getStatusCode().value()).isEqualTo(404);
        assertThat(jdbc.queryForObject("select count(*) from part_revision where part_design_id = ?",
                Long.class, partId)).isZero();
    }

    // ---------- 上传 ----------

    @Test
    void uploadRequestForDisallowedExtensionIsRejectedBeforeAnyRowIsCreated() throws Exception {
        Customer c = register("ext");
        UUID revId = createRevision(c, createPart(c));

        ResponseEntity<String> res = rawPost(filesPath(c, revId),
                new CustomerPartController.RequestUploadRequest("virus.exe", "application/octet-stream"), c.token());
        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(messageOf(res)).isEqualTo("part.file_type_not_allowed");
        assertThat(jdbc.queryForObject("select count(*) from part_file where part_revision_id = ?",
                Long.class, revId)).isZero();
    }

    @Test
    void uploadedPdfCompletesWithTheRealSize() throws Exception {
        Customer c = register("pdf");
        UUID revId = createRevision(c, createPart(c));
        UUID fileId = requestUpload(c, revId, "drawing.pdf", "application/pdf");

        storage.put(storageKeyOf(fileId), new ByteArrayInputStream(PDF), PDF.length, "application/pdf");
        JsonNode done = post(completePath(fileId), null, c.token());

        assertThat(done.path("data").path("uploadStatus").asText()).isEqualTo("COMPLETED");
        assertThat(done.path("data").path("sizeBytes").asLong()).isEqualTo(PDF.length);
    }

    /** 扩展名说是 DWG，字节是 PDF：拒，并且把桶里的对象删掉 —— 不合规的内容不留在存储里。 */
    @Test
    void contentThatDoesNotMatchItsExtensionIsRejectedAndDeleted() throws Exception {
        Customer c = register("fake");
        UUID revId = createRevision(c, createPart(c));
        UUID fileId = requestUpload(c, revId, "drawing.dwg", "application/acad");
        String key = storageKeyOf(fileId);

        storage.put(key, new ByteArrayInputStream(PDF), PDF.length, "application/acad");
        ResponseEntity<String> res = rawPost(completePath(fileId), null, c.token());

        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(messageOf(res)).isEqualTo("part.file_type_not_allowed");
        assertThat(jdbc.queryForObject("select upload_status from part_file where id = ?", String.class, fileId))
                .isEqualTo("REJECTED");
        assertThat(storage.exists(key)).isFalse();
    }

    // ---------- 查看 + 审计（红线 1） ----------

    @Test
    void everyViewUrlIssuanceWritesOneAuditRow() throws Exception {
        Customer c = register("audit");
        UUID revId = createRevision(c, createPart(c));
        UUID fileId = completedPdf(c, revId);

        JsonNode view = get(viewUrlPath(fileId), c.token());
        assertThat(view.path("data").path("url").asText()).isNotBlank();
        assertThat(auditRows(fileId)).isEqualTo(1);

        Map<String, Object> row = jdbc.queryForMap(
                "select part_revision_id, customer_org_id, accessor_user_id, accessor_party_type,"
                        + " accessor_org_id, access_type from part_file_access_log where part_file_id = ?", fileId);
        assertThat(row.get("part_revision_id")).isEqualTo(revId);
        assertThat(row.get("customer_org_id")).isEqualTo(c.orgId());
        assertThat(row.get("accessor_user_id")).isEqualTo(c.userId());
        assertThat(row.get("accessor_party_type")).isEqualTo("CUSTOMER");
        assertThat(row.get("accessor_org_id")).isEqualTo(c.orgId());
        assertThat(row.get("access_type")).isEqualTo("SIGNED_URL_ISSUED");

        get(viewUrlPath(fileId), c.token());
        assertThat(auditRows(fileId)).isEqualTo(2);
    }

    @Test
    void anotherCustomerGets404AndNothingIsAudited() throws Exception {
        Customer owner = register("vowner");
        Customer other = register("vother");
        UUID fileId = completedPdf(owner, createRevision(owner, createPart(owner)));

        ResponseEntity<String> res = rawGet(viewUrlPath(fileId), other.token());
        assertThat(res.getStatusCode().value()).isEqualTo(404);
        assertThat(messageOf(res)).isEqualTo("part.file_not_found");
        assertThat(auditRows(fileId)).isZero();
    }

    @Test
    void pendingFileCannotBeViewedAndNothingIsAudited() throws Exception {
        Customer c = register("pending");
        UUID fileId = requestUpload(c, createRevision(c, createPart(c)), "drawing.pdf", "application/pdf");

        ResponseEntity<String> res = rawGet(viewUrlPath(fileId), c.token());
        assertThat(res.getStatusCode().value()).isEqualTo(409);
        assertThat(messageOf(res)).isEqualTo("part.file_not_completed");
        assertThat(auditRows(fileId)).isZero();
    }

    // ---------- 场景搭建 ----------

    private record Customer(String token, UUID orgId, UUID userId) {
    }

    private Customer register(String tag) throws Exception {
        String email = "part-" + tag + "-" + UUID.randomUUID() + "@example.com";
        JsonNode reg = post("/auth/register",
                new RegisterRequest(PartyType.CUSTOMER, "Acme " + tag, "DE", email, "password123", "Alice"), null);
        String token = post("/auth/login",
                new ExternalAuthController.ExternalLoginRequest(email, "password123"), null)
                .path("data").path("accessToken").asText();
        return new Customer(token,
                UUID.fromString(reg.path("data").path("orgId").asText()),
                UUID.fromString(reg.path("data").path("id").asText()));
    }

    private UUID createPart(Customer c) throws Exception {
        JsonNode part = post("/customer/parts",
                new CustomerPartController.CreatePartRequest(uniqueCode(), "Bracket"), c.token());
        return UUID.fromString(part.path("data").path("id").asText());
    }

    private UUID createRevision(Customer c, UUID partId) throws Exception {
        JsonNode rev = post(revisionsPath(partId), new CustomerPartController.CreateRevisionRequest(null), c.token());
        return UUID.fromString(rev.path("data").path("id").asText());
    }

    private UUID requestUpload(Customer c, UUID revId, String filename, String contentType) throws Exception {
        JsonNode ticket = post(filesPath(c, revId),
                new CustomerPartController.RequestUploadRequest(filename, contentType), c.token());
        assertThat(ticket.path("data").path("uploadUrl").asText()).isNotBlank();
        return UUID.fromString(ticket.path("data").path("fileId").asText());
    }

    private UUID completedPdf(Customer c, UUID revId) throws Exception {
        UUID fileId = requestUpload(c, revId, "drawing.pdf", "application/pdf");
        storage.put(storageKeyOf(fileId), new ByteArrayInputStream(PDF), PDF.length, "application/pdf");
        assertThat(post(completePath(fileId), null, c.token()).path("data").path("uploadStatus").asText())
                .isEqualTo("COMPLETED");
        return fileId;
    }

    /** 存储 key 是服务端内部细节，接口不返回 —— 测试直接从库里读。 */
    private String storageKeyOf(UUID fileId) {
        return jdbc.queryForObject("select storage_key from part_file where id = ?", String.class, fileId);
    }

    private long auditRows(UUID fileId) {
        return jdbc.queryForObject("select count(*) from part_file_access_log where part_file_id = ?", Long.class, fileId);
    }

    private static String uniqueCode() {
        return "LB-" + UUID.randomUUID().toString().substring(0, 8);
    }

    private String revisionsPath(UUID partId) {
        return "/customer/parts/" + partId + "/revisions";
    }

    private String filesPath(Customer c, UUID revId) {
        UUID partId = jdbc.queryForObject("select part_design_id from part_revision where id = ?", UUID.class, revId);
        return "/customer/parts/" + partId + "/revisions/" + revId + "/files";
    }

    private String completePath(UUID fileId) {
        return "/customer/files/" + fileId + "/complete";
    }

    private String viewUrlPath(UUID fileId) {
        return "/customer/files/" + fileId + "/view-url";
    }

    // ---------- HTTP helpers（同 AuthFlowIT：请求体走项目 ObjectMapper，不手写 JSON） ----------

    private JsonNode post(String path, Object body, String bearer) throws Exception {
        return json.readTree(rawPost(path, body, bearer).getBody());
    }

    private ResponseEntity<String> rawPost(String path, Object body, String bearer) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
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

    private String messageOf(ResponseEntity<String> res) throws Exception {
        return json.readTree(res.getBody()).path("message").asText();
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }
}
