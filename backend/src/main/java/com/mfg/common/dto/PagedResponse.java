package com.mfg.common.dto;

import org.springframework.data.domain.Page;

import java.util.List;
import java.util.function.Function;

/**
 * 分页响应。永远不要把 Spring 的 {@code Page} 直接序列化给前端 ——
 * 它的 JSON 形状随 Spring 版本变化，且会把整个 {@code Pageable} 泄露出去。
 */
public record PagedResponse<T>(
        List<T> items,
        int page,          // 1-based，和 PageQuery 一致（Spring 内部 0-based，出口 +1）
        int pageSize,
        long total,
        int totalPages) {

    public static <T> PagedResponse<T> of(Page<T> page) {
        return new PagedResponse<>(
                page.getContent(),
                page.getNumber() + 1,
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages());
    }

    /** 实体分页 → DTO 分页。业务代码最常用的形式。 */
    public static <E, T> PagedResponse<T> of(Page<E> page, Function<E, T> mapper) {
        return new PagedResponse<>(
                page.getContent().stream().map(mapper).toList(),
                page.getNumber() + 1,
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages());
    }
}
