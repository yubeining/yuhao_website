package com.mfg.platform.notification;

/**
 * 一条待发通知。
 *
 * <p>★ 本轮通知服务只做【传输】—— {@code subject} / {@code body} 是【已经渲染好的成品文案】，
 * 由调用方给。通知服务不持有模板、不做 i18n。文案/模板是业务事件出现时才写的东西
 * （按收件人 locale 选语种），不在这一层凭空造（CLAUDE.md §10 C5）。
 *
 * @param channel   走哪个渠道
 * @param recipient 收件人标识：EMAIL 是邮箱地址，WECHAT 是企微 userid
 * @param subject   标题（WECHAT 可用作首行/摘要）
 * @param body      正文（纯文本）
 */
public record NotificationRequest(NotificationChannel channel, String recipient,
                                  String subject, String body) {

    public static NotificationRequest email(String to, String subject, String body) {
        return new NotificationRequest(NotificationChannel.EMAIL, to, subject, body);
    }

    public static NotificationRequest weChat(String weworkUserId, String subject, String body) {
        return new NotificationRequest(NotificationChannel.WECHAT, weworkUserId, subject, body);
    }
}
