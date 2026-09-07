package com.mfg.platform.notification;

/**
 * 通知渠道。加渠道 = 加一个枚举值 + 一个 {@link NotificationSender} 实现，
 * {@code NotificationService} 的入口不用动。
 */
public enum NotificationChannel {

    /** 邮件 —— 客户 / 运营的主通道 */
    EMAIL,

    /** 企业微信 —— 供应商的主通道（设计文档 1 §3.5：只发邮件供应商不会看） */
    WECHAT
}
