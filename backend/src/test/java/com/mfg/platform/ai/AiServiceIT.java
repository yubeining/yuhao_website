package com.mfg.platform.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AiService 对着<b>真实 Sealos aiproxy</b> 的调通测试。
 *
 * <p><b>只在提供了 key 时才跑</b>：环境变量 {@code SEALOS_AI_IT_KEY} 存在才启用（同 S3StorageServiceIT 的模式），
 * CI 不配就跳过。key 只从环境读，绝不写进代码/仓库。本地验证：
 * <pre>
 *   SEALOS_AI_IT_KEY=sk-xxx mvn -Dit.test=AiServiceIT failsafe:integration-test
 * </pre>
 */
@EnabledIfEnvironmentVariable(named = "SEALOS_AI_IT_KEY", matches = ".+")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "spring.ai.openai.base-url=https://aiproxy.bja.sealos.run",
        "spring.ai.openai.api-key=${SEALOS_AI_IT_KEY}",
        "spring.ai.openai.chat.options.model=deepseek-chat"
})
class AiServiceIT {

    @Autowired
    private AiService aiService;

    @Test
    void chatReachesTheModelAndReturnsContent() {
        AiResult result = aiService.chat(new AiRequest(null,
                "You are a test bot. Reply with exactly one word.",
                "Reply with exactly: PONG", null, 0.0, 20));

        assertThat(result.content()).containsIgnoringCase("PONG");
        assertThat(result.promptTokens()).isNotNull();
        assertThat(result.completionTokens()).isNotNull();
    }

    @Test
    void perRequestModelOverrideWorks() {
        String answer = aiService.ask("In one word, what color is the sky on a clear day?");
        assertThat(answer).isNotBlank();
    }
}
