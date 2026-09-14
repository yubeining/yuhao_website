package com.mfg.domain.order;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** 客户订单。所有查询都带客户组织条件(CLAUDE.md §3 铁律 2)。 */
interface CustomerOrderRepository extends JpaRepository<CustomerOrder, UUID> {

    Optional<CustomerOrder> findByIdAndCustomerOrgId(UUID id, UUID customerOrgId);

    Page<CustomerOrder> findByCustomerOrgId(UUID customerOrgId, Pageable pageable);

    /**
     * 条件状态迁移：只有当前状态是 {@code from} 时才改，返回改到的行数。
     * 两个请求同时提交同一张订单，只有一个改到行 —— 另一个拿到 0，回 409，而不是两个都「成功」。
     * 批量更新绕过 {@code @Version} 和 JPA 审计，version / updated_at 手动维护。
     */
    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update CustomerOrder o set o.status = :to, o.submittedAt = :submittedAt,"
            + " o.updatedAt = :now, o.version = o.version + 1"
            + " where o.id = :id and o.customerOrgId = :orgId and o.status = :from")
    int transition(@Param("id") UUID id,
                   @Param("orgId") UUID customerOrgId,
                   @Param("from") CustomerOrder.Status from,
                   @Param("to") CustomerOrder.Status to,
                   @Param("submittedAt") Instant submittedAt,
                   @Param("now") Instant now);
}
