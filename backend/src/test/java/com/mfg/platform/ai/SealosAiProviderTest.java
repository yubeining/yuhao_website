package com.mfg.platform.ai;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 调用方不指定模型时，必须用配置的默认模型（AiRequest 的约定）。
 *
 * <p>★ 2026-11-26 线上事故：每次调用都新建一份 OpenAiChatOptions，没指定模型时 Spring AI 填的是它自己内置的
 *   gpt-5-mini，配置的默认模型被盖掉，网关上没有这个模型 → 智能粘贴全部失败。本地用假网关抓请求确认。
 */
class SealosAiProviderTest {

    private final ChatModel chatModel = mock(ChatModel.class);
    private final SealosAiProvider provider =
            new SealosAiProvider(chatModel, Duration.ofSeconds(30), "deepseek-v4.1-flash");

    @Test
    void usesTheConfiguredDefaultModelWhenTheRequestNamesNone() {
        assertThat(modelSentFor(AiRequest.of("hi"))).isEqualTo("deepseek-v4.1-flash");
        assertThat(modelSentFor(AiRequest.of("hi").withModel(" "))).isEqualTo("deepseek-v4.1-flash");
    }

    @Test
    void usesTheRequestedModelWhenGiven() {
        assertThat(modelSentFor(AiRequest.of("hi").withModel("qwen3.8-max"))).isEqualTo("qwen3.8-max");
    }

    private String modelSentFor(AiRequest request) {
        when(chatModel.call(any(Prompt.class)))
                .thenReturn(new ChatResponse(List.of(new Generation(new AssistantMessage("ok")))));
        provider.call(request);
        ArgumentCaptor<Prompt> prompt = ArgumentCaptor.forClass(Prompt.class);
        verify(chatModel, org.mockito.Mockito.atLeastOnce()).call(prompt.capture());
        return prompt.getValue().getOptions().getModel();
    }
}
