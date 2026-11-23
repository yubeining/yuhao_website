package com.mfg.common.dto;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 先切页再拼视图：拼视图要逐条查库的列表，只为当前这一页拼。
 *
 * <p>★ 以前是全部拼完再切页 —— 1000 张单看第一页也要拼 1000 个视图、查几千次库。
 */
class PagedResponseTest {

    @Test
    void buildsViewsOnlyForTheRequestedPage() {
        List<Integer> all = List.of(1, 2, 3, 4, 5, 6, 7);
        List<List<Integer>> built = new ArrayList<>();

        PagedResponse<String> page = PagedResponse.slice(all, 2, 3, items -> {
            built.add(items);
            return items.stream().map(i -> "v" + i).toList();
        });

        assertThat(built).containsExactly(List.of(4, 5, 6));
        assertThat(page.items()).containsExactly("v4", "v5", "v6");
        assertThat(page.page()).isEqualTo(2);
        assertThat(page.pageSize()).isEqualTo(3);
        assertThat(page.total()).isEqualTo(7);
        assertThat(page.totalPages()).isEqualTo(3);
    }

    @Test
    void pastTheLastPageBuildsNothing() {
        List<List<Integer>> built = new ArrayList<>();

        PagedResponse<String> page = PagedResponse.slice(List.of(1, 2), 5, 3, items -> {
            built.add(items);
            return items.stream().map(String::valueOf).toList();
        });

        assertThat(page.items()).isEmpty();
        assertThat(page.total()).isEqualTo(2);
        assertThat(built).allSatisfy(items -> assertThat(items).isEmpty());
    }
}
