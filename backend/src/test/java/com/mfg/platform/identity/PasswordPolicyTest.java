package com.mfg.platform.identity;

import com.mfg.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 密码规则：至少 8 位，UTF-8 不超过 72 字节（需求方 2026-11-23 定）。建号、改密、重置共用这一处。
 */
class PasswordPolicyTest {

    /** 一个汉字，UTF-8 占 3 字节。 */
    private static final String HAN = "密";

    @Test
    void acceptsBoundaryLengths() {
        assertThat(PasswordPolicy.require("a".repeat(8))).isEqualTo("a".repeat(8));
        assertThat(PasswordPolicy.require("a".repeat(72))).isEqualTo("a".repeat(72));
        assertThat(PasswordPolicy.require(HAN.repeat(24))).isEqualTo(HAN.repeat(24));
    }

    @Test
    void rejectsTooShort() {
        assertThatThrownBy(() -> PasswordPolicy.require("a".repeat(7)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("auth.password_invalid");
    }

    /** BCrypt 只认 72 字节：超过就存不进去（encode 抛异常），所以在这里先拦。 */
    @Test
    void rejectsMoreThan72Bytes() {
        assertThatThrownBy(() -> PasswordPolicy.require("a".repeat(73)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("auth.password_invalid");
        assertThatThrownBy(() -> PasswordPolicy.require(HAN.repeat(25)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("auth.password_invalid");
    }

    @Test
    void rejectsNull() {
        assertThatThrownBy(() -> PasswordPolicy.require(null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("auth.password_invalid");
    }
}
