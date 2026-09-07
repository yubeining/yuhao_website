package com.mfg.common.security;

import com.mfg.platform.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;

import java.net.URI;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 端级硬闸门的集成测试 —— 走真实 Tomcat + 真实 Security filter chain。
 *
 * <p>★ 为什么不用 MockMvc：本测试的核心用例是 URL 编码的路径段
 * （{@code /%6fps/whoami}），要验的正是"容器解码之后拦截器看到的是什么"。
 * MockMvc 不经过 Tomcat 的 URI 处理，测不到这一层。
 *
 * <p>★ 请求一律用 {@link URI} 对象发，不用字符串模板 —— 字符串会被
 * {@code RestTemplate} 当 URI 模板再编码一次，{@code %6f} 变成 {@code %256f}，
 * 测的就不是同一个请求了。
 *
 * <p>背景：2026-09-07 实测 CUSTOMER token 打 {@code /%6fps/whoami} 返回 200。
 * 见 {@code changelog/2026-09-07_portal-guard-encoded-path/}。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class PortalGuardIT {

    private static final Set<String> MEMBER = Set.of("MEMBER");

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private JwtService jwtService;

    // ---------- 基线：闸门本身是通的 ----------

    @Test
    void ownPortalIsAllowed() {
        ResponseEntity<String> res = get("/customer/whoami", token(PartyType.CUSTOMER));
        assertThat(res.getStatusCode().value()).isEqualTo(200);
        assertThat(res.getBody()).contains("\"partyType\":\"CUSTOMER\"");
    }

    @Test
    void plainCrossPortalIsForbidden() {
        ResponseEntity<String> res = get("/ops/whoami", token(PartyType.CUSTOMER));
        assertThat(res.getStatusCode().value()).isEqualTo(403);
        assertThat(res.getBody()).contains("common.wrong_portal");
    }

    @Test
    void unauthenticatedIsRejected() {
        assertThat(get("/ops/whoami", null).getStatusCode().value()).isEqualTo(401);
        assertThat(get("/%6fps/whoami", null).getStatusCode().value()).isEqualTo(401);
    }

    // ---------- ★ 回归：URL 编码的路径段不能绕过闸门 ----------

    @Test
    void percentEncodedFirstSegmentIsStillForbidden() {
        String customer = token(PartyType.CUSTOMER);

        ResponseEntity<String> ops = get("/%6fps/whoami", customer);
        assertThat(ops.getStatusCode().value()).isEqualTo(403);
        assertThat(ops.getBody()).contains("common.wrong_portal");

        ResponseEntity<String> supplier = get("/%73upplier/whoami", customer);
        assertThat(supplier.getStatusCode().value()).isEqualTo(403);
        assertThat(supplier.getBody()).contains("common.wrong_portal");
    }

    @Test
    void percentEncodedSegmentFromSupplierSideIsForbiddenToo() {
        ResponseEntity<String> res = get("/%63ustomer/whoami", token(PartyType.SUPPLIER));
        assertThat(res.getStatusCode().value()).isEqualTo(403);
        assertThat(res.getBody()).contains("common.wrong_portal");
    }

    @Test
    void fullyEncodedSegmentIsForbidden() {
        // 整段全部编码，不只是第一个字符
        ResponseEntity<String> res = get("/%6f%70%73/whoami", token(PartyType.CUSTOMER));
        assertThat(res.getStatusCode().value()).isEqualTo(403);
    }

    @Test
    void encodedOwnPortalStillWorks() {
        // 解码之后是自己的端，不该误伤
        ResponseEntity<String> res = get("/%63ustomer/whoami", token(PartyType.CUSTOMER));
        assertThat(res.getStatusCode().value()).isEqualTo(200);
    }

    // ---------- helpers ----------

    private String token(PartyType type) {
        return jwtService.issueAccessToken(new UserPrincipal(
                UUID.randomUUID(), UUID.randomUUID(), type, null, "en", MEMBER));
    }

    /**
     * @param rawPath 原样发出的路径（含 % 编码），不经过模板展开
     */
    private ResponseEntity<String> get(String rawPath, String bearer) {
        HttpHeaders headers = new HttpHeaders();
        if (bearer != null) {
            headers.setBearerAuth(bearer);
        }
        URI uri = URI.create("http://localhost:" + port + rawPath);
        return rest.exchange(uri, HttpMethod.GET, new HttpEntity<>(headers), String.class);
    }
}
