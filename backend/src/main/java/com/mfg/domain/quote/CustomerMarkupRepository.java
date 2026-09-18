package com.mfg.domain.quote;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

interface CustomerMarkupRepository extends JpaRepository<CustomerMarkup, UUID> {

    Optional<CustomerMarkup> findByCustomerOrgId(UUID customerOrgId);

    /**
     * 有就改、没有就建，一条语句完成。
     *
     * <p>★ 不能「先查、没有再 save」：两个运营同时第一次给同一个客户设加成率，两边都查不到、都去插，
     * 后插的撞唯一索引报 500（2026-09-18 并发测试第 0 轮复现）。{@code ON CONFLICT} 让后到的变成更新，后写的生效。
     * UUID 参数显式 cast：全局配了 UUID 按 varchar 绑定。
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = "insert into customer_markup (id, customer_org_id, markup_rate, created_at, updated_at, version)"
            + " values (cast(:id as uuid), cast(:orgId as uuid), :rate, :now, :now, 0)"
            + " on conflict (customer_org_id) do update set markup_rate = excluded.markup_rate,"
            + " updated_at = excluded.updated_at, version = customer_markup.version + 1", nativeQuery = true)
    int upsert(@Param("id") UUID id, @Param("orgId") UUID customerOrgId, @Param("rate") BigDecimal markupRate,
               @Param("now") Instant now);
}
