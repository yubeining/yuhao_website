package com.mfg.platform.access;

import com.mfg.common.security.PartyType;
import com.mfg.common.security.UserPrincipal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.util.ServletRequestPathUtils;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * ops 端细粒度权限拦截器 —— 单测，mock 掉授权表。
 *
 * <p>核心用例：URL 编码的路径必须解析成路由表里登记的形状。
 * 原来拿 {@code getRequestURI()}（未解码）去查路由表，{@code /%6fps/...} 什么都匹配不上，
 * 于是走了"未注册 = 放行"，细粒度权限被绕过。
 */
class AccessInterceptorTest {

    private static final String API_PREFIX = "/api/v1";

    private final AccessGrantRepository grants = mock(AccessGrantRepository.class);
    private final AccessInterceptor interceptor =
            new AccessInterceptor(API_PREFIX, new RouteAccessRegistry(), grants);

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void encodedPathResolvesToTheRegisteredResourceKey() throws Exception {
        UserPrincipal operator = principal(PartyType.OPERATOR, Set.of("MEMBER"));
        authenticate(operator);
        when(grants.hasGrant(any(), any(), any())).thenReturn(false);

        MockHttpServletRequest request = request("GET", "/api/v1/%6fps/admin/file-access-log/export");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isFalse();
        assertThat(response.getStatus()).isEqualTo(403);
        // 查的是解码后路径对应的 key，而不是"未注册"
        verify(grants).hasGrant(eq(operator.id()), eq("ops/admin/file_access_log"), eq("READ"));
    }

    @Test
    void plainPathWithGrantIsAllowed() throws Exception {
        UserPrincipal operator = principal(PartyType.OPERATOR, Set.of("MEMBER"));
        authenticate(operator);
        when(grants.hasGrant(operator.id(), "ops/quote", "READ")).thenReturn(true);

        MockHttpServletResponse response = new MockHttpServletResponse();
        boolean allowed = interceptor.preHandle(
                request("GET", "/api/v1/ops/quotes/123"), response, new Object());

        assertThat(allowed).isTrue();
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void writeMethodMapsToWriteAction() throws Exception {
        UserPrincipal operator = principal(PartyType.OPERATOR, Set.of("MEMBER"));
        authenticate(operator);
        when(grants.hasGrant(any(), any(), any())).thenReturn(false);

        interceptor.preHandle(
                request("POST", "/api/v1/ops/quotes/123/approve"), new MockHttpServletResponse(), new Object());

        verify(grants).hasGrant(eq(operator.id()), eq("ops/quote/approve"), eq("WRITE"));
    }

    @Test
    void nonOperatorIsNotHandledHere() throws Exception {
        authenticate(principal(PartyType.CUSTOMER, Set.of("MEMBER")));

        boolean allowed = interceptor.preHandle(
                request("GET", "/api/v1/%6fps/quotes"), new MockHttpServletResponse(), new Object());

        // 非 ops 端由端级闸门负责；本拦截器不管辖
        assertThat(allowed).isTrue();
    }

    // ---------- helpers ----------

    private static UserPrincipal principal(PartyType type, Set<String> roles) {
        return new UserPrincipal(UUID.randomUUID(), UUID.randomUUID(), type, null, "en", roles);
    }

    private static void authenticate(UserPrincipal principal) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, List.of()));
    }

    /** 和 DispatcherServlet 一样先把 RequestPath 解析好 —— 拦截器依赖它。 */
    private static MockHttpServletRequest request(String method, String rawUri) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, rawUri);
        ServletRequestPathUtils.parseAndCache(request);
        return request;
    }
}
