package com.mfg.platform.identity.dto;

import com.mfg.platform.identity.ExternalUser;

import java.util.UUID;

/**
 * 用户对外视图 —— 白名单序列化(§5):<b>绝不含 password_hash</b>。新加字段默认不出现。
 */
public record UserView(UUID id, UUID orgId, String email, String displayName,
                       String status, String locale) {

    public static UserView of(ExternalUser u) {
        return new UserView(
                u.getId(),
                u.getOrgId(),
                u.getEmail(),
                u.getDisplayName(),
                u.getStatus().name(),
                u.getLocale());
    }
}
