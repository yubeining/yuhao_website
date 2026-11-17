package com.mfg.domain.order;

import java.util.UUID;

/** 一份图纸的内容（AI 成本估算用）。读出它的那一刻已经落了审计。 */
public record DrawingContent(UUID fileId, String filename, byte[] content) {
}
