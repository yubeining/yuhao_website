package com.mfg.platform.identity.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * 运营端看到的一条供应商邀请（白名单字段，CLAUDE.md §3 铁律 5）。
 *
 * <p>{@code token} <b>只在刚生成时</b>有值（库里只存哈希，之后再也拿不回来）；
 * {@code status}：PENDING 可用 / USED 已注册 / EXPIRED 过期 / REVOKED 已作废。
 */
public record SupplierInviteView(UUID id, String orgName, String email, String status, Instant expiresAt,
                                 Instant usedAt, Instant revokedAt, Instant createdAt, String token) {
}
