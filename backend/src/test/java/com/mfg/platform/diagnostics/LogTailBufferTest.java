package com.mfg.platform.diagnostics;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.LoggingEvent;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class LogTailBufferTest {

    private static LoggingEvent event(String message) {
        LoggingEvent event = new LoggingEvent();
        event.setLoggerContext(new LoggerContext());
        event.setLoggerName("com.mfg.Test");
        event.setLevel(Level.INFO);
        event.setMessage(message);
        event.setTimeStamp(1_700_000_000_000L);
        return event;
    }

    @Test
    void keepsOnlyTheMostRecentLines() {
        LogTailBuffer buffer = new LogTailBuffer();
        for (int i = 0; i < LogTailBuffer.CAPACITY + 5; i++) {
            buffer.append(event("line-" + i));
        }

        assertThat(buffer.size()).isEqualTo(LogTailBuffer.CAPACITY);

        List<String> tail = buffer.tail(3, null);
        assertThat(tail).hasSize(3);
        assertThat(tail.get(2)).contains("line-" + (LogTailBuffer.CAPACITY + 4));
        assertThat(tail.get(0)).contains("line-" + (LogTailBuffer.CAPACITY + 2));
    }

    @Test
    void filtersBySubstring() {
        LogTailBuffer buffer = new LogTailBuffer();
        buffer.append(event("email log-only to=o***@example.invalid"));
        buffer.append(event("auth.otp.send result=sent"));
        buffer.append(event("unrelated"));

        List<String> matched = buffer.tail(10, "otp");

        assertThat(matched).hasSize(1);
        assertThat(matched.get(0)).contains("auth.otp.send");
    }

    @Test
    void endpointIsAbsentWhenTokenIsNotConfigured() {
        LogTailEndpoint endpoint = new LogTailEndpoint(new LogTailBuffer(), "");

        assertThat(endpoint.tail("anything", 10, null, null).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void endpointRejectsWrongTokenAndReturnsLinesForTheRightOne() {
        LogTailBuffer buffer = new LogTailBuffer();
        buffer.append(event("hello"));
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
