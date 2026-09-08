package com.mfg.common.web;

import com.mfg.common.dto.PageQuery;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.ServletWebRequest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 分页解析:默认值、全局封顶、非法输入回落 —— 全局统一,不分受众。
 */
class PageQueryArgumentResolverTest {

    private final PageQueryArgumentResolver resolver =
            new PageQueryArgumentResolver(20, 200);

    private PageQuery resolve(String page, String pageSize) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/customer/rfqs");
        if (page != null) {
            request.setParameter("page", page);
        }
        if (pageSize != null) {
            request.setParameter("pageSize", pageSize);
        }
        return (PageQuery) resolver.resolveArgument(null, null, new ServletWebRequest(request), null);
    }

    @Test
    void defaultsWhenAbsent() {
        PageQuery q = resolve(null, null);
        assertThat(q.page()).isEqualTo(1);
        assertThat(q.size()).isEqualTo(20);
    }

    @Test
    void clampsSizeToGlobalMax() {
        assertThat(resolve("1", "1000000").size()).isEqualTo(200);
    }

    @Test
    void badInputFallsBackToDefault() {
        PageQuery q = resolve("abc", "");
        assertThat(q.page()).isEqualTo(1);
        assertThat(q.size()).isEqualTo(20);
    }

    @Test
    void nonPositivePageClampedToOne() {
        assertThat(resolve("0", "10").page()).isEqualTo(1);
        assertThat(resolve("-5", "10").page()).isEqualTo(1);
    }

    @Test
    void honoursValidValues() {
        PageQuery q = resolve("3", "50");
        assertThat(q.page()).isEqualTo(3);
        assertThat(q.size()).isEqualTo(50);
        assertThat(q.toPageable().getPageNumber()).isEqualTo(2);   // 1-based → 0-based
        assertThat(q.toPageable().getPageSize()).isEqualTo(50);
    }
}
