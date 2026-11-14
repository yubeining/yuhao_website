package com.mfg.platform.diagnostics;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class LogTailBufferTest {

    private static final long NOW = System.currentTimeMillis();
    private static final Duration DAY = Duration.ofHours(24);

    private static LogTailBuffer buffer(int maxLines) {
        return new LogTailBuffer(maxLines, DAY);
    }

    @Test
    void keepsOnlyTheMostRecentLines() {
        LogTailBuffer buffer = buffer(1000);
        for (int i = 0; i < 1005; i++) {
            buffer.appendAt(NOW, "line-" + i);
        }

        assertThat(buffer.size()).isEqualTo(1000);

        List<String> tail = buffer.tail(3, null);
        assertThat(tail).hasSize(3);
        assertThat(tail.get(2)).contains("line-1004");
        assertThat(tail.get(0)).contains("line-1002");
    }

    @Test
    void dropsLinesOlderThanTheRetentionWindow() {
        LogTailBuffer buffer = buffer(1000);
        long twoDaysAgo = NOW - Duration.ofDays(2).toMillis();
        buffer.appendAt(twoDaysAgo, "old line");
        buffer.appendAt(NOW, "fresh line");

        List<String> tail = buffer.tail(10, null);

        assertThat(tail).hasSize(1);
        assertThat(tail.get(0)).contains("fresh line");
    }

    @Test
    void filtersBySubstring() {
        LogTailBuffer buffer = buffer(1000);
        buffer.appendAt(NOW, "email log-only to=o***@example.invalid");
        buffer.appendAt(NOW, "auth.otp.send result=sent");
        buffer.appendAt(NOW, "unrelated");

        List<String> matched = buffer.tail(10, "otp");

        assertThat(matched).hasSize(1);
        assertThat(matched.get(0)).contains("auth.otp.send");
    }

    @Test
    void endpointIsAbsentWhenTokenIsNotConfigured() {
        LogTailEndpoint endpoint = new LogTailEndpoint(buffer(1000), "");

        assertThat(endpoint.tail("anything", 10, null, null).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void endpointRejectsWrongTokenAndReturnsLinesForTheRightOne() {
        LogTailBuffer buffer = buffer(1000);
        buffer.appendAt(NOW, "hello");
        LogTailEndpoint endpoint = new LogTailEndpoint(buffer, "s3cret");
        var request = mock(jakarta.servlet.http.HttpServletRequest.class);
        when(request.getRequestURI()).thenReturn("/actuator/logtail");

        assertThat(endpoint.tail("nope", 10, null, request).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);

        Map<String, Object> body = endpoint.tail("s3cret", 10, null, request).getBody();
        assertThat(body.get("matched")).isEqualTo(1);
        assertThat((List<?>) body.get("lines")).hasSize(1);
    }
}
