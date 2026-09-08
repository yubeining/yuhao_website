package com.mfg.platform.ai;

/**
 * 一次 AI 对话请求。
 *
 * @param system      系统提示（角色/约束），可空
 * @param user        用户输入，必填
 * @param model       指定模型，可空（空则用配置默认 {@code spring.ai.openai.chat.options.model}）——
 *                    Sealos aiproxy 有几百个模型，不同用途可挑不同的
 * @param temperature 采样温度，可空（空则用配置默认）
 * @param maxTokens   最大生成 token，可空
 */
public record AiRequest(String system, String user, String model, Double temperature, Integer maxTokens) {

    public static AiRequest of(String user) {
        return new AiRequest(null, user, null, null, null);
    }

    public static AiRequest of(String system, String user) {
        return new AiRequest(system, user, null, null, null);
    }

    public AiRequest withModel(String model) {
        return new AiRequest(system, user, model, temperature, maxTokens);
    }
}
