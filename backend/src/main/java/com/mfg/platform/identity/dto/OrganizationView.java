package com.mfg.platform.identity.dto;

import com.mfg.platform.identity.Organization;

import java.util.UUID;

/**
 * 组织对外视图 —— 白名单序列化(§5):只暴露显式列出的字段。
 */
public record OrganizationView(UUID id, String type, String name, String country, String status) {

    public static OrganizationView of(Organization o) {
        return new OrganizationView(
                o.getId(),
                o.getType().name(),
                o.getName(),
                o.getCountry(),
                o.getStatus().name());
    }
}
