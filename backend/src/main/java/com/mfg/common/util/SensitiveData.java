package com.mfg.common.util;

/**
 * 敏感数据打码 —— 给日志用。日志里不落完整邮箱 / 手机号（PII，CLAUDE.md §6/§7）。
 *
 * <p>只用于"确实要在日志里留个可辨认的痕迹"的场景（如发信记录）。审计 payload 本就不放 PII，
 * 不需要它。
 */
public final class SensitiveData {

    private SensitiveData() {
    }

    /** {@code john@example.com} → {@code j***@example.com}。 */
    public static String maskEmail(String email) {
        if (email == null || email.isBlank()) {
            return "***";
        }
        int at = email.indexOf('@');
        if (at <= 0) {
            return "***";
        }
        return email.charAt(0) + "***" + email.substring(at);
    }

    /** 手机号保留后 4 位：{@code 13812345678} → {@code ***5678}。 */
    public static String maskPhone(String phone) {
        if (phone == null || phone.length() < 4) {
            return "***";
        }
        return "***" + phone.substring(phone.length() - 4);
    }
}
