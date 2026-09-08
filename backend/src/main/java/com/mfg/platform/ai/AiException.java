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
}
