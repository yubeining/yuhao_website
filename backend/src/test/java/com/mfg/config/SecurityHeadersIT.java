package com.mfg.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 安全响应头就位 —— CSP(XSS 兜底)+ 防点击劫持/嗅探。头对所有响应生效,这里取探针端点验证。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class SecurityHeadersIT {

    @Autowired
    private TestRestTemplate rest;

    @Test
    void securityHeadersPresent() {
        ResponseEntity<String> res = rest.getForEntity("/actuator/health", String.class);
        var headers = res.getHeaders();

        String csp = headers.getFirst("Content-Security-Policy");
        assertThat(csp).isNotNull();
        assertThat(csp).contains("default-src 'self'");
        assertThat(csp).contains("script-src 'self'");
        assertThat(csp).contains("object-src 'none'");
        assertThat(csp).contains("frame-ancestors 'none'");

        assertThat(headers.getFirst("X-Frame-Options")).isEqualTo("DENY");
        assertThat(headers.getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(headers.getFirst("Referrer-Policy")).isEqualTo("same-origin");
    }
}
