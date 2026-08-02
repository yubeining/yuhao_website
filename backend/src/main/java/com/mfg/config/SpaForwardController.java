package com.mfg.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

/**
 * 把前端路由 forward 到 {@code index.html}，让 React Router 接管。
 *
 * <p>前端是 Vite 打出来的 SPA，产物放在 {@code src/main/resources/static/}，
 * 由 Spring Boot 直接托管 —— <b>前后端一个部署单元、一个容器</b>。
 *
 * <p><b>为什么必须显式列出路径前缀，而不是用一个 catch-all</b>
 *
 * <p>Catch-all（{@code /**} 兜底 forward）会把打错字的 API 路径也变成
 * 200 + 一坨 HTML。前端 {@code http.ts} 拿到 HTML 去 {@code response.json()}
 * 会抛 {@code common.malformed_response}，而真实原因是 404 —— 排查时能白白烧掉半天。
 *
 * <p>显式列举的代价是新增一级路由要来这里加一行。这是划算的：
 * 一级路由（= 一个端）几年都不会新增，而路径打错是每天都会发生的事。
 *
 * <p>注意本类是 {@code @Controller} 而不是 {@code @RestController} ——
 * {@link WebMvcConfig} 只给 {@code @RestController} 加 API 前缀，
 * 所以这里的映射保持裸路径。
 */
@Controller
public class SpaForwardController {

    /**
     * 三个端 + 登录页。{@code **} 之下的层级由 React Router 解析。
     *
     * <p>不包含 {@code /api/**}、{@code /actuator/**}、{@code /assets/**} ——
     * 它们各自有真正的 handler / 静态资源解析器。
     */
    @RequestMapping({
            "/customer/**",
            "/supplier/**",
            "/ops/**",
            "/auth/**",
    })
    public String forwardToSpa() {
        return "forward:/index.html";
    }
}
