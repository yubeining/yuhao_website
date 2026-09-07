package com.mfg.platform.notification;

/**
 * 通知发送失败。基础设施级异常。
 *
 * <p>业务通知（{@code notify}）走事务提交后异步发，这个异常在异步线程里被记日志、
 * 不回灌业务事务。只有同步发（{@code sendNow}，如 OTP）才会把它抛给调用方。
 */
public class NotificationException extends RuntimeException {

    public NotificationException(String message, Throwable cause) {
        super(message, cause);
    }
}
