package com.mfg.platform.notification;

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

    public EmailSender(ObjectProvider<JavaMailSender> mailSenderProvider,
                       @Value("${app.notification.email.enabled:true}") boolean enabled,
                       @Value("${app.notification.email.from:}") String from) {
        this.mailSenderProvider = mailSenderProvider;
        this.enabled = enabled;
        this.from = from;
    }

    @Override
    public NotificationChannel channel() {
        return NotificationChannel.EMAIL;
    }

    @Override
    public void send(NotificationRequest request) {
        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (!enabled || mailSender == null) {
            // 只记日志 —— 收件人打码，别把完整邮箱写进日志（PII）
            log.info("[email log-only] to={} subject={}", mask(request.recipient()), request.subject());
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

    /** {@code john@example.com} → {@code j***@example.com}，日志里不落完整邮箱。 */
    private static String mask(String email) {
        if (email == null) {
            return "null";
        }
        int at = email.indexOf('@');
        if (at <= 0) {
            return "***";
        }
        return email.charAt(0) + "***" + email.substring(at);
    }
}
