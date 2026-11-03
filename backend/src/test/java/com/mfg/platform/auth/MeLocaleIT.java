package com.mfg.platform.auth;

import com.mfg.common.security.PartyType;
import com.mfg.platform.identity.ExternalUserRepository;
import com.mfg.platform.identity.dto.RegisterRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 修改自己的语言偏好 —— 真 Tomcat + 真库。
 *
 * <p>重点不是"能不能存"，而是：<b>只能改自己的</b>、<b>非法取值被拒</b>、
 * <b>端级闸门仍然生效</b>（客户 token 打不到供应商那条路径）。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class MeLocaleIT {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private ExternalUserRepository externalUsers;

    @Test
    void customerCanChangeOwnLocale() throws Exception {
        String email = register();
        String token = login(email);

        ResponseEntity<String> res = patch("/customer/me/locale", "{\"locale\":\"zh\"}", token);
        assertThat(res.getStatusCode().value()).isEqualTo(200);

        assertThat(externalUsers.findByEmail(email).orElseThrow().getLocale()).isEqualTo("zh");
    }

    @Test
    void unsupportedLocaleIsRejected() throws Exception {
        String email = register();
        String token = login(email);

        ResponseEntity<String> res = patch("/customer/me/locale", "{\"locale\":\"xx\"}", token);
        assertThat(res.getStatusCode().value()).isEqualTo(400);
        // 没被写进去 —— 否则前端拿它查文案表会查空
        assertThat(externalUsers.findByEmail(email).orElseThrow().getLocale()).isNull();
    }

    @Test
    void customerTokenCannotUseSupplierPath() throws Exception {
        String email = register();
        String token = login(email);

        assertThat(patch("/supplier/me/locale", "{\"locale\":\"en\"}", token).getStatusCode().value())
                .isEqualTo(403);
    }

    @Test
    void anonymousCannotChangeLocale() throws Exception {
        assertThat(patch("/customer/me/locale", "{\"locale\":\"en\"}", null).getStatusCode().value())
                .isEqualTo(401);
    }

    // ---------- helpers ----------

    private String register() throws Exception {
        String email = "loc-" + UUID.randomUUID() + "@example.com";
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        rest.postForEntity(url("/auth/register"),
                new HttpEntity<>(new RegisterRequest(PartyType.CUSTOMER, "Locale GmbH", "DE",
                        email, "password123", "Lena"), headers),
                String.class);
        return email;
    }

    private String login(String email) throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> res = rest.postForEntity(url("/auth/login"),
                new HttpEntity<>(new ExternalAuthController.ExternalLoginRequest(email, "password123"), headers),
                String.class);
        return json.readTree(res.getBody()).path("data").path("accessToken").asText();
    }

    private ResponseEntity<String> patch(String path, String body, String bearer) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) {
            headers.setBearerAuth(bearer);
        }
        return rest.exchange(url(path), HttpMethod.PATCH, new HttpEntity<>(body, headers), String.class);
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }
}
