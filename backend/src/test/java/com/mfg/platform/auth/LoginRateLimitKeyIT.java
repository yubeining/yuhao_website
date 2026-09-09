package com.mfg.platform.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 登录限流的计数桶必须和"这是哪个账号"用同一套规整。
 *
 * <p>★ 这条测试钉的是一个真实出现过的绕过:限流 key 只 {@code toLowerCase()} 而没有
 * {@code trim()},但 {@code AuthService.normalize()} 是 {@code trim().toLowerCase()}。
 * 于是 " a@b.com" 和 "a@b.com" 落在两个计数桶里,查用户时却 trim 成同一个人 ——
 * 攻击者每多加一个空格就白得一整轮尝试次数,口令爆破实际上没有上限。
 *
 * <p>它不测"限流能不能限",那是 {@code RateLimitAspectIT} 的事。它只测<b>桶的身份</b>:
 * 空格和大小写的变体必须归到同一个桶。上限压到 2,让断言快且确定。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "app.auth.login.max-attempts=2",
        "app.auth.login.window-seconds=60"
})
class LoginRateLimitKeyIT {

    @Autowired
    private TestRestTemplate rest;

    @Test
    void whitespaceAndCaseVariantsShareOneRateLimitBucket() {
        String email = "rl-" + UUID.randomUUID() + "@example.com";

        // 上限 2:前两次是普通的认证失败
        assertThat(login(email).getStatusCode().value()).isEqualTo(401);
        assertThat(login(email.toUpperCase()).getStatusCode().value()).isEqualTo(401);

        // 第三次换成"前后加空格"的变体。修复前它会落进另一个桶,继续返回 401;
        // 修复后 trim 让它落回同一个桶,必须是 429。
        assertThat(login("  " + email + "  ").getStatusCode().value()).isEqualTo(429);
    }

    private ResponseEntity<String> login(String account) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return rest.postForEntity(
                "/auth/login",
                new HttpEntity<>(new ExternalAuthController.ExternalLoginRequest(account, "wrong-password"), headers),
                String.class);
    }
}
