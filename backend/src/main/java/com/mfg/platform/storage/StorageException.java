package com.mfg.platform.storage;

/**
 * 对象存储操作失败。基础设施级异常 ——
 * 由 {@code GlobalExceptionHandler} 兜底成 500 {@code common.internal_error}。
 *
 * <p>"对象不存在"不用它表达：{@code head} 返回空 {@code Optional}、{@code exists} 返回 false，
 * 由调用方（文件域）决定这算不算业务错误。
 */
public class StorageException extends RuntimeException {

    public StorageException(String message, Throwable cause) {
        super(message, cause);
    }
}
