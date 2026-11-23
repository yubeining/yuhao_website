package com.mfg.platform.identity;

import com.mfg.common.exception.BusinessException;

import java.nio.charset.StandardCharsets;

/**
 * 密码规则的唯一一处：运营建号、用户改密、忘记密码重置都走这里，不许各写一套。
 *
 * <p>至少 8 位、UTF-8 不超过 72 字节，都是需求方定的（2026-11-23，changelog/2026-11-23_password-reset）。
 * 72 字节来自 BCrypt：超过它 Spring Security 的 {@code encode} 直接抛异常（存不进去），
 * {@code matches} 则只比前 72 字节。英文最多 72 位，中文最多 24 个字。
 * 不加大小写 / 数字 / 符号的组合要求，也不接常见密码黑名单（同上，需求方明确不要）。
 */
public final class PasswordPolicy {

    public static final int MIN = 8;
    public static final int MAX_BYTES = 72;

    private PasswordPolicy() {
    }

    /** @return 原值；不合规抛 400 {@code auth.password_invalid}。 */
    public static String require(String raw) {
        if (raw == null || raw.length() < MIN
                || raw.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            throw new BusinessException(400, "auth.password_invalid");
        }
        return raw;
    }
}
