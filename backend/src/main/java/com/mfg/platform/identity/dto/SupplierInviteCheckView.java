package com.mfg.platform.identity.dto;

import java.time.Instant;

/** 公开：凭链接查邀请，注册页预填用。只给企业名、邮箱、到期时间。 */
public record SupplierInviteCheckView(String orgName, String email, Instant expiresAt) {
}
