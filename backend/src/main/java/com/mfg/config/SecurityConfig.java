package com.mfg.config;

import com.mfg.platform.auth.JwtAuthFilter;
import org.springframework.beans.factory.annotation.Value;
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

    public SecurityConfig(@Value("${app.api.prefix:}") String apiPrefix, JwtAuthFilter jwtAuthFilter) {
        this.apiPrefix = apiPrefix == null ? "" : apiPrefix;
        this.jwtAuthFilter = jwtAuthFilter;
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
