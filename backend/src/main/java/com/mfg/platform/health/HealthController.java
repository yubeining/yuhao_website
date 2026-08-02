package com.mfg.platform.health;

import org.springframework.boot.info.BuildProperties;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
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
 *
 * <h3>★ 为什么要返回 commit</h3>
 *
 * <p>部署完之后，<b>没有任何办法从外部知道线上跑的是哪个版本</b>。
 * 于是「我明明改了并且部署了，怎么没生效」就成了一个无法证伪的问题 ——
 * 可能是没 push、可能是构建用了旧缓存、可能是健康检查失败后回滚了、
 * 也可能真的生效了只是改错了地方。四种情况的排查方向完全不同。
 *
 * <p>返回 commit 之后这个问题一秒钟就能定论：
 * {@code curl .../public/ping} 出来的 commit 和你 push 的对不对得上。
 */
@RestController
public class HealthController {

    /**
     * ★ 用 ObjectProvider 而不是直接注入。
     *
     * <p>{@code BuildProperties} 这个 bean 只在 classpath 上存在
     * {@code META-INF/build-info.properties} 时才会被创建，而那个文件是
     * {@code spring-boot-maven-plugin} 的 {@code build-info} 目标生成的 ——
     * 也就是说：<b>打包跑过才有，IDE 里直接跑主类没有</b>。
     *
     * <p>直接注入会让应用在 IDE 里根本起不来，报的还是
     * "no qualifying bean of type BuildProperties" 这种和业务无关的错。
     * 一个诊断端点不该有能力阻止应用启动。
     */
    private final ObjectProvider<BuildProperties> buildProperties;

    public HealthController(ObjectProvider<BuildProperties> buildProperties) {
        this.buildProperties = buildProperties;
    }

    @GetMapping("/public/ping")
    public Map<String, Object> ping() {
        // camelCase 到底，不做任何大小写转换（CLAUDE.md §11 C1）
        // 用 LinkedHashMap 保证字段顺序稳定 —— 人肉 diff 两个环境的输出时有用
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("service", "mfg-backend");
        body.put("serverTime", Instant.now().toString());

        BuildProperties build = buildProperties.getIfAvailable();
        if (build == null) {
            // IDE 里直接跑主类的情况
            body.put("version", "dev");
            body.put("commit", "unknown");
        } else {
            body.put("version", build.getVersion());
            // build-info 里的自定义属性，由部署脚本传入
            body.put("commit", build.get("commit"));
            body.put("builtAt", build.getTime() == null ? null : build.getTime().toString());
        }
        return body;
    }
}
