package com.mfg.platform.diagnostics;

import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;
import jakarta.annotation.PostConstruct;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.List;

/**
 * 最近一段时间内的日志缓冲 —— 给 {@link LogTailEndpoint} 读。
 *
 * <p><b>为什么要有这个：</b>应用日志只写 stdout，容器里没有文件可翻。
 * 排查「验证码到底发没发出去」这类问题时，要么 ssh 进去抓 docker logs，
 * 要么有一个能按关键字查的出口。这里做后者。
 *
 * <p><b>两个上限，先到先算：</b>
 * <ul>
 *   <li>时间：默认保留 24 小时（{@code app.diagnostics.log-tail.retention}）</li>
 *   <li>条数：默认 5 万行（{@code app.diagnostics.log-tail.max-lines}）</li>
 * </ul>
 * 只有时间上限的话，一次异常刷屏就能把堆吃光；只有条数上限的话，
 * 凌晨重启后早上可能只剩十几分钟前的日志。两个都要。
 *
 * <p><b>代价：</b>
 * <ul>
 *   <li>进程内缓冲，重启即清空，多副本各一份 —— 这是排查窗口，不是日志归档</li>
 *   <li>内容含用户可识别信息（邮箱已打码、IP 未打码），所以端点必须带 token</li>
 *   <li>5 万行按每行 200 字节约 10 MB 堆内存，属于可接受范围</li>
 * </ul>
 */
@Component
public class LogTailBuffer {

    /** 单条最长字符数，防止某条超长 SQL / 堆栈把内存吃光。 */
    private static final int MAX_LINE = 4000;

    private final int maxLines;
    private final long retentionMillis;
    private final Deque<Entry> lines;

    public LogTailBuffer(
            @Value("${app.diagnostics.log-tail.max-lines:50000}") int maxLines,
            @Value("${app.diagnostics.log-tail.retention:24h}") Duration retention) {
        this.maxLines = Math.max(1, maxLines);
        this.retentionMillis = Math.max(1, retention.toMillis());
        this.lines = new ArrayDeque<>(Math.min(this.maxLines, 4096));
    }

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
        appendAt(event.getTimeStamp(), line);
    }

    /** 包私有：测试可以直接喂时间戳，不用等真实时钟。 */
    void appendAt(long epochMillis, String line) {
        synchronized (lines) {
            evictExpired(epochMillis);
            if (lines.size() >= maxLines) {
                lines.removeFirst();
            }
            lines.addLast(new Entry(epochMillis, line));
        }
    }

    /**
     * 取最近若干条。
     *
     * @param limit    最多返回多少条；调用方负责夹到 [1, maxLines]
     * @param contains 可选关键字，为空表示不过滤
     */
    public List<String> tail(int limit, String contains) {
        List<String> result = new ArrayList<>();
        synchronized (lines) {
            evictExpired(System.currentTimeMillis());
            var it = lines.descendingIterator();
            while (it.hasNext() && result.size() < limit) {
                String line = it.next().line();
                if (contains == null || contains.isBlank() || line.contains(contains)) {
                    result.add(line);
                }
            }
        }
        Collections.reverse(result);
        return result;
    }

    /** 当前缓冲条数（给端点回显，便于判断是不是被刷掉了）。 */
    public int size() {
        synchronized (lines) {
            evictExpired(System.currentTimeMillis());
            return lines.size();
        }
    }

    /** 单次请求允许取的最大条数 —— 端点用它算上限。 */
    public int maxLines() {
        return maxLines;
    }

    /** 保留窗口（毫秒），端点回显用。 */
    public long retentionMillis() {
        return retentionMillis;
    }

    private void evictExpired(long nowMillis) {
        long cutoff = nowMillis - retentionMillis;
        while (!lines.isEmpty() && lines.peekFirst().epochMillis() < cutoff) {
            lines.removeFirst();
        }
    }

    private record Entry(long epochMillis, String line) {
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
