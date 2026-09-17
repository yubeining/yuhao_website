package com.mfg.domain.order;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** 客户订单。所有查询都带客户组织条件(CLAUDE.md §3 铁律 2)。 */
interface CustomerOrderRepository extends JpaRepository<CustomerOrder, UUID> {

    Optional<CustomerOrder> findByIdAndCustomerOrgId(UUID id, UUID customerOrgId);

    Page<CustomerOrder> findByCustomerOrgId(UUID customerOrgId, Pageable pageable);

    /** 运营端：跨客户。只看提交过的单 —— 草稿是客户自己还没发出来的东西。 */
    Page<CustomerOrder> findBySubmittedAtIsNotNull(Pageable pageable);

    Page<CustomerOrder> findByStatusAndSubmittedAtIsNotNull(CustomerOrder.Status status, Pageable pageable);

    Optional<CustomerOrder> findByIdAndSubmittedAtIsNotNull(UUID id);

    List<CustomerOrder> findByIdInAndCustomerOrgId(Collection<UUID> ids, UUID customerOrgId);

    /** 运营端报价前锁单（跨客户，同 {@link #lockByIdAndCustomerOrgId} 的锁）。草稿不返回。 */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from CustomerOrder o where o.id = :id and o.submittedAt is not null")
    Optional<CustomerOrder> lockSubmittedById(@Param("id") UUID id);

    /**
     * 带行锁取订单（{@code SELECT ... FOR UPDATE}），锁到事务结束。
     *
     * <p>所有改订单的操作（改草稿、加 / 改 / 删行、换图纸、提交、取消）都先拿这把锁，于是它们对同一张订单只能排队。
     * 没有这把锁时，「提交检查完零件行」和「另一个请求加了一行」可以交错，两个都成功，
     * 已提交的订单里就多出一行没锁定、没图纸的 —— 2026-09-15 用并发测试第一轮就复现了。
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from CustomerOrder o where o.id = :id and o.customerOrgId = :orgId")
    Optional<CustomerOrder> lockByIdAndCustomerOrgId(@Param("id") UUID id, @Param("orgId") UUID customerOrgId);

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

    /** 同 {@link #transition}，但不动 {@code submittedAt}：报价 / 确认 / 拒绝用。 */
    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update CustomerOrder o set o.status = :to, o.updatedAt = :now, o.version = o.version + 1"
            + " where o.id = :id and o.customerOrgId = :orgId and o.status = :from")
    int transitionStatus(@Param("id") UUID id,
                         @Param("orgId") UUID customerOrgId,
                         @Param("from") CustomerOrder.Status from,
                         @Param("to") CustomerOrder.Status to,
                         @Param("now") Instant now);
}
