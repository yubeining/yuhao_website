package com.mfg.config;

import com.mfg.platform.auth.JwtAuthFilter;
import org.springframework.beans.factory.annotation.Value;
import static org.springframework.security.config.Customizer.withDefaults;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Spring Security 装配。
 *
 * <h3>这一层只回答一个问题：这个请求需不需要「已登录」</h3>
 *
 * <p>更细的判断都不在这里：
 * <ul>
 *   <li>「能不能进这个端」→ {@code PortalGuardInterceptor}（路径前缀即受众）</li>
 *   <li>「ops 端内部能碰哪个资源」→ {@code AccessInterceptor} + {@code RouteAccessRegistry}</li>
 *   <li>「这条数据是不是你的」→ repository 层的 {@code findByIdAndPartyId}（CLAUDE.md §5）</li>
 * </ul>
 *
 * <p>把这四件事塞进 Security 的 matcher 链是常见的诱惑，但那会让
 * 一条 {@code requestMatchers(...).hasAuthority(...)} 同时承担受众隔离和资源授权，
 * 改错一行就是跨端泄露，而且从 URL 上看不出来。分开之后每一层都只有一种失败模式。
 *
 * <h3>★ 非 API 路径一律 permitAll</h3>
 * <p>那是 SPA 的外壳和静态资源（{@code index.html} / {@code assets/**}）——
 * <b>里面没有任何业务数据</b>，所有数据都得再发一次带 JWT 的 API 请求才拿得到。
 * 让未登录用户能下载到外壳是必须的，否则登录页自己都加载不出来。
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final String apiPrefix;
    private final JwtAuthFilter jwtAuthFilter;
    private final String contentSecurityPolicy;

    public SecurityConfig(@Value("${app.api.prefix:}") String apiPrefix,
                          JwtAuthFilter jwtAuthFilter,
                          @Value("${app.storage.s3.public-endpoint:}") String storagePublicEndpoint,
                          @Value("${app.storage.s3.endpoint:}") String storageEndpoint) {
        this.apiPrefix = apiPrefix == null ? "" : apiPrefix;
        this.jwtAuthFilter = jwtAuthFilter;
        // 图纸/图片走对象存储的签名 URL(外网域名),CSP 的 img/connect 要放行它 ——
        // 域名不写死,从存储配置推出(§C3:存储位置全走配置)。取 public-endpoint,没有则回落 endpoint。
        String storageOrigin = originOf(
                storagePublicEndpoint != null && !storagePublicEndpoint.isBlank()
                        ? storagePublicEndpoint : storageEndpoint);
        this.contentSecurityPolicy = buildCsp(storageOrigin);
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                // 纯 JWT，无 session、无 cookie → CSRF 不适用
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

                // ★ 安全响应头 —— 防 XSS 兜底(CSP)+ 防点击劫持/嗅探。
                //   CSP 是关键:即便前端某处被注入脚本,也只能加载同源脚本、禁 inline/eval,
                //   注入的代码跑不起来、也连不出去。script-src 'self':vite 产物全是同源打包,不用 CDN。
                .headers(h -> h
                        .contentSecurityPolicy(csp -> csp.policyDirectives(contentSecurityPolicy))
                        .frameOptions(fo -> fo.deny())
                        .contentTypeOptions(withDefaults())
                        .referrerPolicy(rp -> rp.policy(ReferrerPolicy.SAME_ORIGIN)))

                .authorizeHttpRequests(auth -> auth
                        // 探针。show-details: never，不泄露依赖状态
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info")
                        .permitAll()

                        // 公开端点：官网留资、登录、公开报价查看链接
                        // ★ 这些端点的数据范围必须从资源反查，绝不信客户端传的 party
                        //   （CLAUDE.md §5 铁律 5）
                        .requestMatchers(apiPrefix + "/public/**", apiPrefix + "/auth/**")
                        .permitAll()

                        // 其余 API 一律要登录
                        .requestMatchers(apiPrefix + "/**").authenticated()

                        // 非 API = SPA 外壳 + 静态资源。见类注释。
                        .anyRequest().permitAll())

                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((req, res, e) -> writeError(res, HttpStatus.UNAUTHORIZED))
                        .accessDeniedHandler((req, res, e) -> writeError(res, HttpStatus.FORBIDDEN)))

                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * 组装 CSP。默认全 {@code 'self'};把对象存储的外网 origin 放进 img/media/connect ——
     * 图纸预览({@code <img>})和签名 URL 上传下载({@code fetch})都指向它。
     * {@code style-src 'unsafe-inline'}:前端有内联样式,先放开;以后用 nonce/hash 收紧。
     */
    static String buildCsp(String storageOrigin) {
        String ext = storageOrigin == null ? "" : " " + storageOrigin;
        return "default-src 'self'; "
                + "script-src 'self'; "
                + "style-src 'self' 'unsafe-inline'; "
                + "img-src 'self' data: blob:" + ext + "; "
                + "font-src 'self' data:; "
                + "connect-src 'self'" + ext + "; "
                + "object-src 'none'; "
                + "base-uri 'self'; "
                + "form-action 'self'; "
                + "frame-ancestors 'none'";
    }

    /**
     * 从 URL 取 {@code scheme://host[:port]};空/非法/集群内网返回 null(那就 CSP 里不加额外 origin)。
     *
     * <p>★ 明确排除集群内网地址:CSP 管的是<b>浏览器</b>能加载什么,而内网域名浏览器永远解析不了。
     * 把它写进 CSP 既没用,还会掩盖「真正该放行的外网地址没配」这件事 ——
     * 上线后表现为图裂、下载不了,且只在浏览器控制台报错,后端日志一片干净。
     */
    static String originOf(String url) {
        if (url == null || url.isBlank() || StorageConfig.isClusterInternal(url)) {
            return null;
        }
        try {
            java.net.URI u = java.net.URI.create(url.trim());
            if (u.getScheme() == null || u.getHost() == null) {
                return null;
            }
            return u.getScheme() + "://" + u.getHost() + (u.getPort() == -1 ? "" : ":" + u.getPort());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /**
     * 客户端邮箱密码登录用。供应商走手机号验证码，ops 走企微扫码，都不经过这里。
     *
     * <p>强度用默认的 10。调高之前先量登录耗时 —— BCrypt 每 +1 耗时翻倍，
     * 调到 14 会让登录接口变成几百毫秒，而对本系统的威胁模型没有实质提升。
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * 错误响应形状和 {@code ApiResponse} 保持一致 —— 前端 {@code http.ts}
     * 无条件按 envelope 解析，这里返回别的形状会让它抛
     * {@code common.malformed_response}，掩盖真实原因。
     *
     * <p>message 是 i18n code 而不是文案（CLAUDE.md §7）。
     */
    private static void writeError(jakarta.servlet.http.HttpServletResponse response, HttpStatus status)
            throws java.io.IOException {
        String code = status == HttpStatus.UNAUTHORIZED ? "common.unauthenticated" : "common.forbidden";
        response.setStatus(status.value());
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(
                "{\"code\":" + status.value() + ",\"message\":\"" + code + "\",\"data\":null}");
    }
}
