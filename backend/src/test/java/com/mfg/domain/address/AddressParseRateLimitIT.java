package com.mfg.domain.address;

import com.mfg.common.security.PartyType;
import com.mfg.platform.ai.AiResult;
import com.mfg.platform.ai.AiService;
import com.mfg.platform.auth.ExternalAuthController;
import com.mfg.platform.identity.dto.RegisterRequest;
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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * 智能粘贴按用户限流：每人每小时 30 次，第 31 次 429（2026-11-26）。
 *
 * <p>只 mock 外部 AI（测试环境不连真模型、也不该按次计费）；限流走真 Redis（§9 禁止 mock Redis）。
 * 计数按用户算：别人用满了不影响你。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class AddressParseRateLimitIT {

    private static final String PARSE = "/customer/shipping-addresses/parse";

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private StringRedisTemplate redis;

    @MockitoBean
    private AiService ai;

    @BeforeEach
    void setUp() {
        redis.execute((RedisConnection c) -> {
            c.serverCommands().flushDb();
            return null;
        });
        when(ai.chat(any())).thenReturn(new AiResult("{\"city\":\"Leeds\"}", "test-model", null, null));
    }

    @Test
    void thirtyParsesPerUserPerHourThenTooManyRequests() throws Exception {
        String alice = token("alice");
        String bob = token("bob");
        for (int i = 0; i < 30; i++) {
            ResponseEntity<String> res = parse(alice);
            assertThat(res.getStatusCode().value()).as("call %d %s", i + 1, res.getBody()).isEqualTo(200);
        }
        JsonNode last = json.readTree(parse(bob).getBody());
        assertThat(last.path("data").path("city").asText()).isEqualTo("Leeds");

        ResponseEntity<String> limited = parse(alice);
        assertThat(limited.getStatusCode().value()).as(limited.getBody()).isEqualTo(429);
        assertThat(json.readTree(limited.getBody()).path("message").asText()).isEqualTo("common.rate_limited");
        // 别人的额度不受影响
        assertThat(parse(bob).getStatusCode().value()).isEqualTo(200);
    }

    private ResponseEntity<String> parse(String token) {
        return exchange(PARSE, new CustomerShippingAddressController.ParseRequest("1 Sample Road, Leeds"), token);
    }

    private String token(String tag) throws Exception {
        String email = "parse-" + tag + "-" + UUID.randomUUID() + "@example.com";
        exchange("/auth/register",
                new RegisterRequest(PartyType.CUSTOMER, "Acme " + tag, "DE", email, "password123", "Alice"), null);
        return json.readTree(exchange("/auth/login",
                new ExternalAuthController.ExternalLoginRequest(email, "password123"), null).getBody())
                .path("data").path("accessToken").asText();
    }

    private ResponseEntity<String> exchange(String path, Object body, String bearer) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) {
            headers.setBearerAuth(bearer);
        }
        return rest.exchange("http://localhost:" + port + path, HttpMethod.POST, new HttpEntity<>(body, headers),
                String.class);
    }
}
