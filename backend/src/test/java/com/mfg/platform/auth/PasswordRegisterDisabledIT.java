package com.mfg.platform.auth;

import com.mfg.common.security.PartyType;
import com.mfg.platform.identity.dto.RegisterRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 「邮箱 + 密码」注册接口默认关闭（生产形状）。
 *
 * <p>2026-11-18 review：这个接口不验证邮箱归属，任何人都能用别人的邮箱 + 自己的密码抢先注册；
 * 对方以后用验证码登录，进的就是这个账号，抢注的人一直能用密码看到里面的图纸和订单。
 * 注册的唯一入口是验证码注册（2026-11-14），前端早已不调这个接口。
 * 其他集成测试靠它建账号，所以 test profile 里是打开的；这里显式关掉，钉住生产行为。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
@TestPropertySource(properties = "app.auth.password-register-enabled=false")
class PasswordRegisterDisabledIT {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void passwordRegistrationIsNotFoundAndCreatesNothing() {
        String email = "squat-" + UUID.randomUUID() + "@example.com";

        ResponseEntity<String> res = rest.postForEntity("http://localhost:" + port + "/auth/register",
                new RegisterRequest(PartyType.CUSTOMER, "Acme", "DE", email, "password123", "Mallory"), String.class);

        assertThat(res.getStatusCode().value()).isEqualTo(404);
        assertThat(jdbc.queryForObject("select count(*) from external_user where email = ?", Long.class, email))
                .isZero();
    }
}
