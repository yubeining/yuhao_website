package com.mfg.platform.notification;

import com.mfg.platform.async.AfterCommitExecutor;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 通知分发逻辑的单测。用同步执行器的 {@link AfterCommitExecutor}（无事务时立即跑），
 * 让 {@code notify} 在测试里同步落到 fake sender 上，便于断言。
 */
class NotificationServiceTest {

    /** 记录收到的请求的假 sender。 */
    private static class FakeSender implements NotificationSender {
        private final NotificationChannel channel;
        final List<NotificationRequest> received = new ArrayList<>();
        private RuntimeException toThrow;

        FakeSender(NotificationChannel channel) {
            this.channel = channel;
        }

        @Override
        public NotificationChannel channel() {
            return channel;
        }

        @Override
        public void send(NotificationRequest request) {
            if (toThrow != null) {
                throw toThrow;
            }
            received.add(request);
        }
    }

    // 无事务上下文 → AfterCommitExecutor 立即执行；用 Runnable::run 让它同步跑
    private final AfterCommitExecutor afterCommit = new AfterCommitExecutor(Runnable::run);

    @Test
    void notifyDispatchesToTheRightChannel() {
        FakeSender email = new FakeSender(NotificationChannel.EMAIL);
        FakeSender wechat = new FakeSender(NotificationChannel.WECHAT);
        NotificationService service = new NotificationService(List.of(email, wechat), afterCommit);

        service.notify(NotificationRequest.email("a@b.com", "hi", "body"));
        service.notify(NotificationRequest.weChat("wxuser", "hi", "body"));

        assertThat(email.received).singleElement()
                .satisfies(r -> assertThat(r.recipient()).isEqualTo("a@b.com"));
        assertThat(wechat.received).singleElement()
                .satisfies(r -> assertThat(r.recipient()).isEqualTo("wxuser"));
    }

    @Test
    void sendNowReturnsWhenSenderSucceeds() {
        FakeSender email = new FakeSender(NotificationChannel.EMAIL);
        NotificationService service = new NotificationService(List.of(email), afterCommit);

        service.sendNow(NotificationRequest.email("a@b.com", "s", "b"));

        assertThat(email.received).hasSize(1);
    }

    @Test
    void sendNowThrowsWhenNoSenderForChannel() {
        // 只注册 email，发 wechat → 无 sender
        NotificationService service =
                new NotificationService(List.of(new FakeSender(NotificationChannel.EMAIL)), afterCommit);

        assertThatThrownBy(() -> service.sendNow(NotificationRequest.weChat("u", "s", "b")))
                .isInstanceOf(NotificationException.class)
                .hasMessageContaining("WECHAT");
    }

    @Test
    void sendNowWrapsSenderFailure() {
        FakeSender email = new FakeSender(NotificationChannel.EMAIL);
        email.toThrow = new RuntimeException("smtp down");
        NotificationService service = new NotificationService(List.of(email), afterCommit);

        assertThatThrownBy(() -> service.sendNow(NotificationRequest.email("a@b.com", "s", "b")))
                .isInstanceOf(NotificationException.class)
                .hasMessageContaining("EMAIL");
    }

    @Test
    void rejectsTwoSendersForSameChannel() {
        assertThatThrownBy(() -> new NotificationService(
                List.of(new FakeSender(NotificationChannel.EMAIL), new FakeSender(NotificationChannel.EMAIL)),
                afterCommit))
                .isInstanceOf(IllegalStateException.class);
    }
}
