package com.mfg.platform.ai;

/**
 * 一次 AI 对话的结果。
 *
 * @param content          模型返回的文本
 * @param model            实际使用的模型
 * @param promptTokens     输入 token 数，可空
 * @param completionTokens 输出 token 数，可空
 */
public record AiResult(String content, String model, Integer promptTokens, Integer completionTokens) {
}
