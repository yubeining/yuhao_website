package com.mfg.platform.ai;

/**
 * 全平台统一的 AI 入口 —— 业务代码只依赖这个接口，看不到底层是 Spring AI / 哪个模型 /
 * 哪个网关（和 StorageService、NotificationService 一个套路）。
 *
 * <p>底层实现打的是 Sealos aiproxy 的 OpenAI 兼容端点（改 base-url）。换模型、换网关、
 * 换 provider 都只改配置或换实现，业务侧不动。
 *
 * <p><b>本轮只做单轮对话（chat completion）。</b>流式、结构化输出（文档 8 AI 报价要的
 * 基准价+置信度+区间）、工具调用等，等对应业务真用到时在实现里加，接口按需扩展。
 */
public interface AiService {

    /**
     * 单轮对话。
     *
     * @throws AiException 调用失败
     */
    AiResult chat(AiRequest request);

    /** 便捷：只给一句用户输入，返回文本。 */
    default String ask(String prompt) {
        return chat(AiRequest.of(prompt)).content();
    }
}
