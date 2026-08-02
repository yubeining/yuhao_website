package com.mfg.platform.auth;

import com.mfg.common.security.UserPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * 从 {@code Authorization: Bearer <token>} 还原 principal 放进 SecurityContext。
 *
 * <p><b>本 filter 不做拒绝</b>。token 缺失或无效时它什么也不做，直接放行 ——
 * 该不该拒由 {@code SecurityConfig} 的 authorize 规则和
 * {@code PortalGuardInterceptor} 决定。
 *
 * <p>这样分工的好处是公开端点（{@code /public/**}）不需要任何豁免配置：
 * 没 token 就是没 principal，而公开端点本来就不需要 principal。
 * 如果在 filter 里直接 401，每加一个公开端点都要回来改白名单，早晚漏。
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String HEADER = "Authorization";
    private static final String PREFIX = "Bearer ";

    /** 角色前缀。Spring Security 的 hasRole() 约定要 ROLE_ 开头。 */
    private static final String ROLE_PREFIX = "ROLE_";

    private final JwtService jwtService;

    public JwtAuthFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {

        String token = extractToken(request);
        if (token != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            UserPrincipal principal = jwtService.parse(token);
            if (principal != null) {
                List<SimpleGrantedAuthority> authorities = principal.roles().stream()
                        .map(r -> new SimpleGrantedAuthority(ROLE_PREFIX + r))
                        .toList();
                var auth = new UsernamePasswordAuthenticationToken(principal, null, authorities);
                auth.setDetails(principal.partyType());
                SecurityContextHolder.getContext().setAuthentication(auth);
            }
        }

        chain.doFilter(request, response);
    }

    private static String extractToken(HttpServletRequest request) {
        String header = request.getHeader(HEADER);
        if (header == null || !header.startsWith(PREFIX)) {
            return null;
        }
        String token = header.substring(PREFIX.length()).trim();
        return token.isEmpty() ? null : token;
    }
}
