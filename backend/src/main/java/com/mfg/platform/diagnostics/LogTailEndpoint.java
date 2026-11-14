package com.mfg.platform.diagnostics;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.stereotype.Controller;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 读最近日志的出口：{@code GET /actuator/logtail?token=…&lines=200&q=keyword}。
 *
 * <p><b>为什么放在 /actuator 下而不是业务 API：</b>它不是业务能力，是运维出口；
 * 放在 actuator 路径下，安全配置里只有这一条白名单，不会跟着 API 前缀的受众规则走。
 *
 * <p><b>安全：</b>
 * <ul>
 *   <li>{@code LOG_TAIL_TOKEN} 没配 → 恒 404，等于端点不存在（默认关闭）</li>
 *   <li>token 比对用常量时间比较，避免按耗时猜</li>
 *   <li>只返回内存里最近的日志，不读文件、不支持翻页</li>
 * </ul>
 *
 * <p><b>开启方式：</b>给应用加环境变量 {@code LOG_TAIL_TOKEN=<随机串>} 后重启。
 * 关闭：删掉这个变量再重启。用完建议直接关掉 —— 日志里可能有订单号、邮箱、IP。
 */
@Controller
@RequestMapping("/actuator/logtail")
public class LogTailEndpoint {

    /** 一次最多返回多少条。再多也不该用这个看。 */
    private static final int MAX_LINES = 1000;
    private static final int DEFAULT_LINES = 200;

    private final LogTailBuffer buffer;
    private final String token;

    public LogTailEndpoint(LogTailBuffer buffer,
                           @Value("${app.diagnostics.log-token:}") String token) {
        this.buffer = buffer;
        this.token = token == null ? "" : token.trim();
    }

    @GetMapping
    @ResponseBody
    ResponseEntity<Map<String, Object>> tail(@RequestParam(name = "token", required = false) String provided,
                                             @RequestParam(name = "lines", required = false) Integer lines,
                                             @RequestParam(name = "q", required = false) String q,
                                             HttpServletRequest request) {
        // ★ 用返回值给状态码，不抛 ResponseStatusException：
        //   全局异常处理器会把未识别异常的 ResponseStatusException 统一成 500，
        //   那样「没配 token」会变成 500 而不是"这个路径不存在"。
        if (token.isEmpty()) {
            // 没开启时表现得像这个路径不存在
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "not found"));
        }
        if (provided == null || !constantTimeEquals(token, provided)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "unauthorized"));
        }

        int limit = lines == null ? DEFAULT_LINES : Math.min(Math.max(lines, 1), MAX_LINES);
        List<String> matched = buffer.tail(limit, q);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("size", buffer.size());
        body.put("limit", limit);
        body.put("q", q);
        body.put("matched", matched.size());
        body.put("lines", matched);
        body.put("path", request.getRequestURI());
        return ResponseEntity.ok(body);
    }

    private static boolean constantTimeEquals(String expected, String actual) {
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8));
    }
}
