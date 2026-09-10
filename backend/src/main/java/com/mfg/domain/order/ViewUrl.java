package com.mfg.domain.order;

import java.time.Instant;

/** 查看图纸的短时签名 URL。每签发一个就落一行审计（红线 1）。 */
public record ViewUrl(String url, Instant expiresAt) {
}
