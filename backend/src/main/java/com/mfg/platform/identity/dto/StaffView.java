package com.mfg.platform.identity.dto;

import com.mfg.platform.identity.OpsUser;
import com.mfg.platform.identity.Organization;

import java.time.Instant;
import java.util.UUID;

/**
 * 运营端「运营账号」列表的一行 —— 白名单序列化，不含 {@code password_hash}。
 *
 * <p>和 {@link AccountView} 分开是刻意的：两类账号来自两张物理隔离的表，
 * 字段也不同（运营账号没有 {@code email_verified_at}）。合成一个 DTO 会让
 * 「这一行到底是从哪张表来的」在类型层面消失。
 */
public record StaffView(UUID id, UUID orgId, String orgName,
                        String email, String displayName, String status, String locale,
                        Instant createdAt) {

    public static StaffView of(OpsUser u, Organization org) {
        return new StaffView(
                u.getId(),
                u.getOrgId(),
                org == null ? null : org.getName(),
                u.getEmail(),
                u.getDisplayName(),
                u.getStatus().name(),
                u.getLocale(),
                u.getCreatedAt());
    }
}
