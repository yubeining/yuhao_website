package com.mfg.common.exception;

/**
 * 业务异常。{@code messageCode} 是 i18n code 而不是文案 —— 见 CLAUDE.md §7。
 *
 * <p>用法：
 * <pre>
 *   throw new BusinessException(409, "quote.expired");
 *   throw new BusinessException(403, "party.kyc_required");
 * </pre>
 *
 * <p>{@code data} 可选，用于 409 需要回传冲突详情的场景
 * （例如报价被抢先接受时回传当前状态）。
 */
public class BusinessException extends RuntimeException {

    private final int code;
    private final String messageCode;
    private final transient Object data;

    public BusinessException(int code, String messageCode) {
        this(code, messageCode, null);
    }

    public BusinessException(int code, String messageCode, Object data) {
        super(messageCode);
        this.code = code;
        this.messageCode = messageCode;
        this.data = data;
    }

    public int getCode() {
        return code;
    }

    public String getMessageCode() {
        return messageCode;
    }

    public Object getData() {
        return data;
    }

    // --- 常用构造快捷方式 ---

    public static BusinessException notFound(String messageCode) {
        return new BusinessException(404, messageCode);
    }

    public static BusinessException forbidden(String messageCode) {
        return new BusinessException(403, messageCode);
    }

    public static BusinessException conflict(String messageCode) {
        return new BusinessException(409, messageCode);
    }

    public static BusinessException badRequest(String messageCode) {
        return new BusinessException(400, messageCode);
    }
}
