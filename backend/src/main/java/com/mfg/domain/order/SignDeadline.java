package com.mfg.domain.order;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/**
 * 签字期限：接单时间 + N 天。**N = 7 是需求方定的（2026-09-20），不是工程取值**；
 * 做成配置项只为测试和将来改数方便，改它等于改业务规则。
 *
 * <p>★ 从<b>接单</b>那一刻算，不是从运营建合同算 —— 需求方明确选的，代价是运营拖着不建合同也会占掉这 7 天。
 *
 * <p>配置用 {@code @Value} 直接取，不注入 {@code AppProperties} —— 域不许依赖 {@code config}（ArchUnit 卡这条）。
 */
@Component
class SignDeadline {

    private final Duration window;

    SignDeadline(@Value("${app.dispatch.sign-timeout-days}") int signTimeoutDays) {
        this.window = Duration.ofDays(signTimeoutDays);
    }

    Instant deadlineOf(Instant acceptedAt) {
        return acceptedAt == null ? null : acceptedAt.plus(window);
    }

    /** 这一刻之前接的单，如果还没签字就算超时。 */
    Instant overdueBefore(Instant now) {
        return now.minus(window);
    }
}
