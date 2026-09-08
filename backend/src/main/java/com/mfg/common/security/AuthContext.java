package com.mfg.common.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;

/**
 * 当前请求登录态的统一取法 —— 收口散在各处的
 * {@code SecurityContextHolder.getContext().getAuthentication()...instanceof UserPrincipal}。
 *
 * <p>之前 PortalGuard / AccessInterceptor / AuditLogAspect / CurrentUserArgumentResolver 各抠一遍，
 * 既重复又容易写歪（比如漏判 isAuthenticated）。都改走这里。
 */
public final class AuthContext {

    private AuthContext() {
    }

    /** 当前登录用户；未登录 / principal 类型不对时返回 {@code null}。 */
    public static UserPrincipal currentPrincipal() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return null;
        }
        return auth.getPrincipal() instanceof UserPrincipal up ? up : null;
    }

    public static Optional<UserPrincipal> current() {
        return Optional.ofNullable(currentPrincipal());
    }
}
