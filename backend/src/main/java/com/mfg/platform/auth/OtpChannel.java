package com.mfg.platform.auth;

/**
 * 验证码的发送渠道。
 *
 * <p>本轮<b>只实现 EMAIL</b>。{@code SMS} 的枚举值先留着，是为了让接口形状（{@code channel} 参数）
 * 现在就是终态 —— 但<b>发到 SMS 会明确返回 {@code auth.otp_channel_unavailable}</b>，
 * 不会假装发出去。短信通道落地时要补的是：{@code NotificationChannel.SMS} + {@code SmsSender}
 * + 阿里云配置，以及 {@code external_user.phone} 那一列。
 */
public enum OtpChannel {
    EMAIL,
    SMS
}
