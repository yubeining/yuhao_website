package com.mfg.platform.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 企业微信渠道 —— 供应商侧通知的主通道。
 *
 * <p><b>企微 corp API 尚未接入。</b>{@code app.notification.wechat.enabled} 默认 false，
 * 此时只打日志（收件人是企微 userid，非 PII，可直接记）。真接入（拿 corp access_token、
 * 调发消息接口、处理 token 缓存与限流）是后续任务 —— 现在先把这个 sender 的位置占好，
 * 让业务流程能对着 WECHAT 渠道编码。
 */
@Component
public class WeChatSender implements NotificationSender {

    private static final Logger log = LoggerFactory.getLogger(WeChatSender.class);

    private final boolean enabled;

    public WeChatSender(@Value("${app.notification.wechat.enabled:false}") boolean enabled) {
        this.enabled = enabled;
    }

    @Override
    public NotificationChannel channel() {
        return NotificationChannel.WECHAT;
    }

    @Override
    public void send(NotificationRequest request) {
        if (!enabled) {
            log.info("[wechat log-only] to={} subject={}", request.recipient(), request.subject());
            return;
        }
        // enabled=true 但集成还没做 —— 明确 warn，别让人以为真发出去了
        log.warn("wechat is enabled but the corp API integration is not implemented yet; "
                + "dropping message to={} subject={}", request.recipient(), request.subject());
    }
}
