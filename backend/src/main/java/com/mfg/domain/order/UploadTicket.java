package com.mfg.domain.order;

import java.time.Instant;
import java.util.UUID;

/** 申请上传的回执：浏览器拿 {@code uploadUrl} 直传桶，传完用 {@code fileId} 调 complete。 */
public record UploadTicket(UUID fileId, String uploadUrl, Instant expiresAt) {
}
