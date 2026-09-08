package com.mfg.platform.ai;

/**
 * 一个 AI provider（一个大模型网关 / 一家厂商）。<b>加一个 provider = 加一个实现类</b>，
 * Spring 自动收集，{@link AiModelRegistry} 按名字路由 —— 业务侧只依赖 {@link AiService}，
 * 不知道也不关心底下有几家。
 *
 * <p>当前只有 Sealos aiproxy（OpenAI 兼容）。将来接别的（真 OpenAI / DashScope / 自建）
 * 就再写一个 {@code XxxProvider implements AiProvider}。
 */
public interface AiProvider {

    /** provider 唯一名，如 {@code sealos}。请求里的 {@code provider} 按它匹配。 */
    String name();

    AiResult call(AiRequest request);
}
