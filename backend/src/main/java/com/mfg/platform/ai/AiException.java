package com.mfg.platform.ai;

/**
 * AI 调用失败（网络 / 鉴权 / 模型不存在 / 超时等）。基础设施级异常，
 * 由 GlobalExceptionHandler 兜底成 500。调用方（如 AI 报价）应对它有降级预案 ——
 * AI 不可用不能让整个报价流程卡死（文档 8：置信度不足转人工）。
 */
public class AiException extends RuntimeException {

    public AiException(String message, Throwable cause) {
        super(message, cause);
    }

    /**
     * 把异常链拼成一行文字写进日志（原来在 EstimateService，智能粘贴也要用，2026-11-26 挪到这里）。
     *
     * <p>★ 不能把异常对象直接当最后一个参数传给 log.warn：SLF4J 会把它当堆栈处理、不填进 {@code {}}，
     * 而线上日志出口（/actuator/logtail）只存消息正文、不存堆栈 —— 原因就整个丢了（2026-11-17 线上第一次失败时就是这样）。
     * 网关的错误信息（HTTP 状态 + 错误体）不含密钥；截到 800 字防止刷屏。
     */
    public static String describe(Throwable e) {
        StringBuilder sb = new StringBuilder();
        for (Throwable t = e; t != null && sb.length() < 800; t = t.getCause() == t ? null : t.getCause()) {
            if (sb.length() > 0) sb.append(" <- ");
            sb.append(t.getClass().getSimpleName());
            if (t.getMessage() != null) sb.append(": ").append(t.getMessage().replaceAll("\\s+", " "));
        }
        return sb.length() > 800 ? sb.substring(0, 800) : sb.toString();
    }
}
