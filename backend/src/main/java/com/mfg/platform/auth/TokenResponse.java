package com.mfg.platform.auth;

/**
 * 登录 / 刷新的返回。{@code portalType} 让前端知道落哪个端;{@code displayName}/{@code locale}
 * 供前端首屏用(principal 里不带 displayName)。
 */
public record TokenResponse(String accessToken, String refreshToken,
                            String portalType, String displayName, String locale) {
}
