package com.mfg.platform.notification;

import com.mfg.common.util.SensitiveData;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/**
 * 邮件渠道。
 *
 * <p><b>没配 SMTP 就 log-only。</b>{@code spring.mail.host} 没设时 Spring 不会创建
 * {@link JavaMailSender}，这里通过 {@link ObjectProvider} 拿不到就只打日志、不发也不报错 ——
 * 本地和还没接邮件的环境照样能把业务流程跑通。配了 SMTP 且 {@code app.notification.email.enabled}
 * 为 true 才真发。
 */
@Component
public class EmailSender implements NotificationSender {

    private static final Logger log = LoggerFactory.getLogger(EmailSender.class);

    private final ObjectProvider<JavaMailSender> mailSenderProvider;
    private final boolean enabled;
    private final String from;
    private final boolean hostConfigured;
    private final boolean logBody;

    public EmailSender(ObjectProvider<JavaMailSender> mailSenderProvider,
                       @Value("${app.notification.email.enabled:true}") boolean enabled,
                       @Value("${app.notification.email.from:}") String from,
                       @Value("${spring.mail.host:}") String host,
                       @Value("${app.notification.email.log-body:false}") boolean logBody) {
        this.mailSenderProvider = mailSenderProvider;
        this.enabled = enabled;
        this.from = from;
        // ★ 只判 mailSender == null 不够：application.yml 里写了 host: ${MAIL_HOST:}，
        //   即使值为空字符串，Spring 也会创建 JavaMailSender bean。于是"没配 SMTP"会被
        //   当成"配好了"，第一次发码就抛 MailSendException —— 而它发生在登录路径上。
        this.hostConfigured = host != null && !host.isBlank();
        // ★ 默认 false：正文（登录验证码）属于凭据，不该默认进日志。
        //   本地开发要自测才显式打开 —— 没有这个开关，没配 SMTP 时码根本拿不到。
        this.logBody = logBody;
    }

    @Override
    public NotificationChannel channel() {
        return NotificationChannel.EMAIL;
    }

    @Override
    public void send(NotificationRequest request) {
        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (!enabled || !hostConfigured || mailSender == null) {
            // 只记日志 —— 收件人打码，别把完整邮箱写进日志（PII）
            if (logBody) {
                log.info("[email log-only] to={} subject={} body={}",
                        SensitiveData.maskEmail(request.recipient()), request.subject(), request.body());
            } else {
                log.info("[email log-only] to={} subject={}",
                        SensitiveData.maskEmail(request.recipient()), request.subject());
            }
            return;
        }
        SimpleMailMessage message = new SimpleMailMessage();
        if (!from.isBlank()) {
            message.setFrom(from);
        }
        message.setTo(request.recipient());
        message.setSubject(request.subject());
        message.setText(request.body());
        mailSender.send(message);
    }
}
