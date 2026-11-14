package com.mfg.platform.diagnostics;

import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;
import jakarta.annotation.PostConstruct;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/**
 * 最近 N 条日志的内存缓冲 —— 给 {@link LogTailEndpoint} 读。
 *
 * <p><b>为什么要有这个：</b>应用日志只写 stdout，容器里没有文件可翻。
 * 排查「验证码到底发没发出去」这类问题时，要么 ssh 进去抓 docker logs，
 * 要么有一个能按关键字查最近日志的出口。这里做后者。
 *
 * <p><b>代价要说清楚：</b>
 * <ul>
 *   <li>只保留最近 {@value #CAPACITY} 条，重启即清空，不是日志归档</li>
 *   <li>内容含用户可识别信息（邮箱已打码、IP 未打码），所以端点必须带 token</li>
 *   <li>进程内缓冲，多副本时每个 pod 各一份 —— 要看哪个 pod 得分别查</li>
 * </ul>
 */
@Component
public class LogTailBuffer {

    /** 保留条数。1000 条大约是几百 KB 内存，够覆盖一次请求前后。 */
    static final int CAPACITY = 1000;

    /** 单条最长字符数，防止某条超长 SQL / 堆栈把内存吃光。 */
    private static final int MAX_LINE = 4000;

    private final Deque<String> lines = new ArrayDeque<>(CAPACITY);

    /**
     * 把追加器挂到 root logger 上。
     *
     * <p>只在 logback 下工作（Spring Boot 默认日志实现）。换成别的实现时这里不生效，
     * 端点会返回空列表 —— 比启动失败好。
     */
    @PostConstruct
    void attach() {
        if (!(LoggerFactory.getILoggerFactory() instanceof LoggerContext context)) {
            return;
        }
        TailAppender appender = new TailAppender(this);
        appender.setContext(context);
        appender.setName("log-tail-buffer");
        appender.start();
        context.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME).addAppender(appender);
    }

    void append(ILoggingEvent event) {
        String message = event.getFormattedMessage();
        if (message != null && message.length() > MAX_LINE) {
            message = message.substring(0, MAX_LINE) + "...";
        }
        String line = Instant.ofEpochMilli(event.getTimeStamp())
                + " " + event.getLevel()
                + " " + event.getLoggerName()
                + " - " + message;
        synchronized (lines) {
            if (lines.size() >= CAPACITY) {
                lines.removeFirst();
            }
            lines.addLast(line);
        }
    }

    /**
     * 取最近若干条。
     *
     * @param limit    最多返回多少条，调用方负责夹到 [1, CAPACITY]
     * @param contains 可选关键字，为空表示不过滤
     */
    public List<String> tail(int limit, String contains) {
        List<String> snapshot;
        synchronized (lines) {
            snapshot = new ArrayList<>(lines);
        }
        List<String> result = new ArrayList<>();
        for (int i = snapshot.size() - 1; i >= 0 && result.size() < limit; i--) {
            String line = snapshot.get(i);
            if (contains == null || contains.isBlank() || line.contains(contains)) {
                result.add(line);
            }
        }
        java.util.Collections.reverse(result);
        return result;
    }

    /** 当前缓冲条数（给端点回显，便于判断是不是被刷掉了）。 */
    public int size() {
        synchronized (lines) {
            return lines.size();
        }
    }

    private static final class TailAppender extends AppenderBase<ILoggingEvent> {
        private final LogTailBuffer buffer;

        private TailAppender(LogTailBuffer buffer) {
            this.buffer = buffer;
        }

        @Override
        protected void append(ILoggingEvent event) {
            buffer.append(event);
        }
    }
}
