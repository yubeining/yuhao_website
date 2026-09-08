package com.mfg.platform.identity.dto;

import com.mfg.common.security.PartyType;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 外部自助注册请求 —— 建一个新组织 + 它的第一个用户。
 *
 * <p>{@code portalType} 只能是 CUSTOMER / SUPPLIER(运营不自助注册,由 service 校验)。
 * 服务端计算/推导的字段(orgId、status、passwordHash)不在此收(§5 铁律 3)。
 */
public record RegisterRequest(
        @NotNull PartyType portalType,
        @NotBlank String orgName,
        String country,
        @NotBlank @Email String email,
        @NotBlank @Size(min = 8, max = 100) String password,
        @NotBlank String displayName) {
}
