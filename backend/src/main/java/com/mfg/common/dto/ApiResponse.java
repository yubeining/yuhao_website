package com.mfg.common.dto;

/**
 * 统一响应外壳。所有 controller 返回值由 {@code ResponseWrapperAdvice} 自动包装成这个形状，
 * 业务代码通常不需要手动构造。
 *
 * <p>{@code message} 是 <b>i18n code 而不是文案</b>（见 CLAUDE.md §7）。
 * 本系统是三语的（EN/DE 给客户、中文给供应商和内部），后端返文案等于把语言绑死在后端。
 * 前端拿 code 查翻译表。
 *
 * @param code    业务状态码，与 HTTP 状态一致（200 / 400 / 403 / 404 / 409 / 500）
 * @param message i18n code，成功时是 {@code "ok"}
 * @param data    负载
 */
public record ApiResponse<T>(int code, String message, T data) {

    private static final String OK = "ok";

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(200, OK, data);
    }

    public static <T> ApiResponse<T> success() {
        return new ApiResponse<>(200, OK, null);
    }

    /** @param messageCode i18n code，不是文案 */
    public static <T> ApiResponse<T> error(int code, String messageCode) {
        return new ApiResponse<>(code, messageCode, null);
    }

    /** 带负载的错误 —— 用于 409 冲突需要回传冲突详情的场景。 */
    public static <T> ApiResponse<T> error(int code, String messageCode, T data) {
        return new ApiResponse<>(code, messageCode, data);
    }
}
