package com.mfg.platform.notification;

/**
 * 单个渠道的发送器。每个 {@link NotificationChannel} 一个实现，Spring 自动收集，
 * {@code NotificationService} 按 {@link #channel()} 分发。
 */
public interface NotificationSender {

    NotificationChannel channel();

    /**
     * 同步发出。失败抛 {@link NotificationException} 或渠道自己的运行时异常。
     * 渠道未配置（没 SMTP / 微信 secret）时应【只记日志、不抛】—— 让流程能在没配通道的
     * 环境里跑通。
     */
    void send(NotificationRequest request);
}
