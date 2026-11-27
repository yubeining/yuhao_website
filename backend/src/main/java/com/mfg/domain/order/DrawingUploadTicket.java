package com.mfg.domain.order;

import java.time.Instant;
import java.util.UUID;

/**
 * 申请上传图纸的回执：浏览器拿 {@code uploadUrl} 直传桶，传完用 {@code uploadId} 调 complete。
 * {@code contentType} 被签进了 URL，PUT 时必须带一模一样的 Content-Type。
 *
 * <p>{@code uploadId} 是一张上传凭证，不是文件 id —— 申请时不建文件记录，complete 校验通过才建
 * （2026-11-27），所以传失败什么都不留。凭证到 {@code expiresAt} 自动作废。
 */
public record DrawingUploadTicket(UUID uploadId, String uploadUrl, String contentType, Instant expiresAt) {
}
