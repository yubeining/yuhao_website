package com.mfg.platform.health;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

/**
 * 冒烟端点。落在 {@code /public/**} 下，无需鉴权。
 *
 * <p>它验证的是<b>整条链路装配正确</b>，而不只是「进程活着」（那是 actuator 的活）：
 * <ul>
 *   <li>{@code @RestController} 被套上了 API 前缀 → 实际路径是 {@code /api/v1/public/ping}</li>
 *   <li>{@code ResponseWrapperAdvice} 把返回值包成了 {@code ApiResponse} 外壳</li>
 *   <li>{@code public} 段不受端级闸门管辖，且 Security 放行</li>
 * </ul>
 *
 * <p>部署后第一件事就是 curl 它 —— 比翻启动日志快得多，
 * 而且这三条里任何一条错了，业务接口都会以很难懂的方式失败。
 */
@RestController
public class HealthController {

    @GetMapping("/public/ping")
    public Map<String, Object> ping() {
        // camelCase 到底，不做任何大小写转换（CLAUDE.md §11 C1）
        return Map.of(
                "service", "mfg-backend",
                "serverTime", Instant.now().toString());
    }
}
