package com.mfg.platform.identity.dto;

import com.mfg.platform.identity.Organization;

import java.time.Instant;
import java.util.UUID;

/**
 * 运营端「组织」列表的一行。
 *
 * <p>和对外暴露的 {@link OrganizationView} 分开：外面那两个端点
 * （{@code /customer/organization}、{@code /supplier/organization}）不该因为运营端多了个
 * 创建时间就跟着多吐一个字段 —— 白名单是逐端点算的，不是逐实体算的。
 */
public record OrganizationAdminView(UUID id, String type, String name, String country,
                                    String status, Instant createdAt) {

    public static OrganizationAdminView of(Organization o) {
        return new OrganizationAdminView(
                o.getId(), o.getType().name(), o.getName(), o.getCountry(),
                o.getStatus().name(), o.getCreatedAt());
    }
}
