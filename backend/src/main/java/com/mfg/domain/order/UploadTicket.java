package com.mfg.domain.order;

import java.time.Instant;
import java.util.UUID;

/**
 * 申请上传的回执：浏览器拿 {@code uploadUrl} 直传桶，传完用 {@code fileId} 调 complete。
 * {@code contentType} 被签进了 URL，PUT 时必须带一模一样的 Content-Type。
 */
public record UploadTicket(UUID fileId, String uploadUrl, String contentType, Instant expiresAt) {
}
