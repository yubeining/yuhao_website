package com.mfg.platform.ai;

import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.content.Media;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeType;

import java.time.Duration;
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
    private final Duration timeout;
    private final String defaultModel;

    /**
     * ★ 超时要在每次调用的 options 里显式带上：Spring AI 2.x 的 OpenAiChatOptions 自带一个 60 秒的默认超时，
     *   每次 new 一个 options，这 60 秒就盖掉了 {@code spring.ai.openai.timeout} —— 配多少都还是 60 秒
     *   （2026-11-18 线上把超时调到 180 秒仍在 60 秒断开，本地对着不回应的端口实测确认）。
     */
    /**
     * ★ 默认模型也要在每次调用时显式带上，理由同超时：新建的 options 里没写模型时，Spring AI 填的是它自己内置的
     *   模型（实测是 gpt-5-mini），{@code spring.ai.openai.chat.options.model} 被盖掉。网关上没有那个模型，
     *   不指定模型的调用全部失败（2026-11-26 智能粘贴线上首测，本地用假网关抓请求确认）。
     */
    public SealosAiProvider(ChatModel chatModel, @Value("${spring.ai.openai.timeout:180s}") Duration timeout,
                            @Value("${spring.ai.openai.chat.options.model}") String defaultModel) {
        this.chatModel = chatModel;
        this.timeout = timeout;
        this.defaultModel = defaultModel;
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
        List<Media> media = request.images().stream()
                .map(img -> new Media(MimeType.valueOf(img.mimeType()), new ByteArrayResource(img.data())))
                .toList();
        messages.add(UserMessage.builder().text(request.user()).media(media).build());

        OpenAiChatOptions.Builder options = OpenAiChatOptions.builder().timeout(timeout)
                .model(request.model() != null && !request.model().isBlank() ? request.model() : defaultModel);
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
