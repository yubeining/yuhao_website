package com.mfg.platform.ai;

/**
 * 随请求一起发给模型的一张图片（需要模型支持看图）。
 *
 * @param mimeType 如 {@code image/png}
 * @param data     图片字节
 */
public record AiImage(String mimeType, byte[] data) {
}
