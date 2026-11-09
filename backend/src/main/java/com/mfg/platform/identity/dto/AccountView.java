package com.mfg.platform.identity.dto;

import com.mfg.platform.identity.ExternalUser;
import com.mfg.platform.identity.Organization;

import java.time.Instant;
import java.util.UUID;

/**
 * 运营端「外部用户」列表的一行 —— 白名单序列化（CLAUDE.md §3 铁律 5）。
 *
 * <p>★ 不含 {@code password_hash}，也不含任何凭据字段。新加字段默认不出现。
 * <p>{@code orgName}/{@code orgType} 在列表里一并给出，否则前端要为每一行再查一次公司。
 */
public record AccountView(UUID id, UUID orgId, String orgName, String orgType,
                          String email, String displayName, String status, String locale,
                          Instant emailVerifiedAt, Instant createdAt) {

    public static AccountView of(ExternalUser u, Organization org) {
        return new AccountView(
                u.getId(),
                u.getOrgId(),
                org == null ? null : org.getName(),
                org == null ? null : org.getType().name(),
                u.getEmail(),
                u.getDisplayName(),
                u.getStatus().name(),
                u.getLocale(),
                u.getEmailVerifiedAt(),
                u.getCreatedAt());
    }
}
