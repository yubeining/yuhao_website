package com.mfg.platform.notification;

import com.mfg.config.AsyncConfig;
import com.mfg.platform.async.AfterCommitExecutor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;

/**
 * 通知统一入口。按渠道分发到对应的 {@link NotificationSender}。
 *
 * <h3>两种发法</h3>
 * <ul>
 *   <li>{@link #notify} —— <b>业务通知</b>。走 {@link AfterCommitExecutor}：有事务就等提交后再异步发，
 *       事务回滚就不发（不会出现"库里没成、客户却收到确认"）；没事务就直接异步发。
 *       失败在异步线程里被记日志，不回灌业务。<b>绝不在事务内调外部服务</b>（文档 3 §4）。</li>
 *   <li>{@link #sendNow} —— <b>需要立刻知道结果</b>的场景（如登录 OTP：发不出去就不能让用户等验证码）。
 *       同步发，失败抛 {@link NotificationException}。</li>
 * </ul>
 *
 * <h3>本轮只做传输</h3>
 * <p>{@code subject}/{@code body} 是调用方给的成品文案，这里不碰模板、不做 i18n、不落发送记录
 * （失败只打日志）。这些等真有业务通知时按需要再加。
 */
@Service
public class NotificationService {

    private final Map<NotificationChannel, NotificationSender> byChannel;
    private final AfterCommitExecutor afterCommit;
    private final Executor notificationExecutor;

    public NotificationService(List<NotificationSender> senders, AfterCommitExecutor afterCommit,
                              @Qualifier(AsyncConfig.NOTIFICATION_EXECUTOR) Executor notificationExecutor) {
        this.notificationExecutor = notificationExecutor;
        Map<NotificationChannel, NotificationSender> map = new EnumMap<>(NotificationChannel.class);
        for (NotificationSender sender : senders) {
            NotificationSender existing = map.put(sender.channel(), sender);
            if (existing != null) {
                throw new IllegalStateException(
                        "two senders for channel " + sender.channel() + ": "
                        + existing.getClass().getSimpleName() + " and " + sender.getClass().getSimpleName());
            }
        }
        this.byChannel = map;
        this.afterCommit = afterCommit;
    }

    /** 业务通知：事务提交后、在【通知专用池】异步发，失败只记日志。 */
    public void notify(NotificationRequest request) {
        afterCommit.executeOn(notificationExecutor, () -> dispatch(request));
    }

    /** 同步发，需要立刻知道结果时用（如 OTP）。失败抛 {@link NotificationException}。 */
    public void sendNow(NotificationRequest request) {
        dispatch(request);
    }

    private void dispatch(NotificationRequest request) {
        NotificationSender sender = byChannel.get(request.channel());
        if (sender == null) {
            throw new NotificationException("no sender registered for channel " + request.channel(), null);
        }
        try {
            sender.send(request);
        } catch (NotificationException e) {
            throw e;
        } catch (RuntimeException e) {
            throw new NotificationException("send failed on channel " + request.channel(), e);
        }
    }
}
