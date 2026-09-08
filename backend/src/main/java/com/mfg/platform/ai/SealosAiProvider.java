package com.mfg.platform.ai;

import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Sealos aiproxy 的 {@link AiProvider}（Spring AI 的 OpenAI 兼容 client，base-url 指向 aiproxy）。
 *
 * <p>装配（base-url / api-key / 默认模型）全走 {@code spring.ai.openai.*} 配置，
 * Spring Boot 自动配好 {@link ChatModel}，这里只拿来用。请求可覆盖模型 / 温度 / maxTokens
 * （每次调用带 {@link OpenAiChatOptions}）。
 */
@Service
public class SealosAiProvider implements AiProvider {

    private final ChatModel chatModel;

    public SealosAiProvider(ChatModel chatModel) {
        this.chatModel = chatModel;
    }

    @Override
    public String name() {
        return "sealos";
    }

    @Override
    public AiResult call(AiRequest request) {
        List<Message> messages = new ArrayList<>();
        if (request.system() != null && !request.system().isBlank()) {
            messages.add(new SystemMessage(request.system()));
        }
        messages.add(new UserMessage(request.user()));

        OpenAiChatOptions.Builder options = OpenAiChatOptions.builder();
        if (request.model() != null && !request.model().isBlank()) {
            options.model(request.model());
        }
        if (request.temperature() != null) {
            options.temperature(request.temperature());
        }
        if (request.maxTokens() != null) {
            options.maxTokens(request.maxTokens());
        }

        try {
            ChatResponse response = chatModel.call(new Prompt(messages, options.build()));
            String content = response.getResult().getOutput().getText();
            String model = response.getMetadata() == null ? null : response.getMetadata().getModel();
            Usage usage = response.getMetadata() == null ? null : response.getMetadata().getUsage();
            return new AiResult(content, model, intOrNull(usage == null ? null : usage.getPromptTokens()),
                    intOrNull(usage == null ? null : usage.getCompletionTokens()));
        } catch (RuntimeException e) {
            throw new AiException("AI chat call failed", e);
        }
    }

    private static Integer intOrNull(Number n) {
        return n == null ? null : n.intValue();
    }
}
