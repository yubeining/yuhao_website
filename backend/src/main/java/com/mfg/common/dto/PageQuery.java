package com.mfg.common.dto;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

/**
 * 分页请求入参 —— controller 方法直接收它,由 {@code PageQueryArgumentResolver} 从
 * {@code ?page=&pageSize=} 解析、并<b>按受众(路径前缀)把 size 封顶</b>后注入。
 *
 * <p>为什么不用 Spring 的 {@code Pageable} 直接做入参:它 0-based(第一页是 0,反直觉)、
 * 还会顺带把 {@code sort} 从 query 里注进来(接口契约失控),且没有 size 上限(可被
 * {@code pageSize=1000000} 拖库)。这里 {@code page} 从 1 起、size 已封顶、sort 由后端定。
 *
 * <p>{@link #toPageable()} 转成 Spring 的 0-based {@link Pageable} 交给 repository。
 */
public record PageQuery(int page, int size) {

    /** 兜底:直接构造(非解析器路径)时也保证 page≥1、size≥1,避免 PageRequest 抛异常。 */
    public PageQuery {
        if (page < 1) {
            page = 1;
        }
        if (size < 1) {
            size = 1;
        }
    }

    /** 转 Spring Pageable（1-based → 0-based）。 */
    public Pageable toPageable() {
        return PageRequest.of(page - 1, size);
    }

    /** 带排序(排序由后端指定,不从 query 收)。 */
    public Pageable toPageable(Sort sort) {
        return PageRequest.of(page - 1, size, sort);
    }
}
