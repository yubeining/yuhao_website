package com.mfg.domain.order;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** 供应商订单。供应商端的查询都带供应商组织条件（CLAUDE.md §3 铁律 2）。 */
interface SupplierOrderRepository extends JpaRepository<SupplierOrder, UUID> {

    Optional<SupplierOrder> findByIdAndSupplierOrgId(UUID id, UUID supplierOrgId);

    /**
     * 只取所属生产订单的 id —— 写操作要先锁生产订单，锁之前<b>不能</b>把供应商订单实体读进来：
     * 同一个事务里锁之后再 find，Hibernate 返回的是锁之前缓存的那个对象，状态是旧的。
     */
    @Query("select so.opsOrderId from SupplierOrder so where so.id = :id")
    Optional<UUID> findOpsOrderIdById(@Param("id") UUID id);

    /** 同上，带供应商组织条件（CLAUDE.md §3 铁律 2）。 */
    @Query("select so.opsOrderId from SupplierOrder so where so.id = :id and so.supplierOrgId = :supplierOrgId")
    Optional<UUID> findOpsOrderIdByIdAndSupplierOrgId(@Param("id") UUID id, @Param("supplierOrgId") UUID supplierOrgId);

    List<SupplierOrder> findBySupplierOrgIdOrderByAcceptedAtDesc(UUID supplierOrgId);

    Optional<SupplierOrder> findByOpsOrderIdAndStatus(UUID opsOrderId, SupplierOrder.Status status);

    Optional<SupplierOrder> findFirstByOpsOrderIdAndStatusIn(UUID opsOrderId, Collection<SupplierOrder.Status> statuses);

    /** 超时扫描：接单早于 {@code before} 且还没签字的。 */
    List<SupplierOrder> findByStatusInAndAcceptedAtBefore(Collection<SupplierOrder.Status> statuses, Instant before);

    List<SupplierOrder> findByOpsOrderIdOrderByAcceptedAtDesc(UUID opsOrderId);

    List<SupplierOrder> findByOpsOrderIdInAndStatusIn(Collection<UUID> opsOrderIds,
                                                     Collection<SupplierOrder.Status> statuses);

    /** 运营的生产与质检页：已签字之后的单，最近接的在前。 */
    List<SupplierOrder> findByStatusInOrderByAcceptedAtDesc(Collection<SupplierOrder.Status> statuses);
}
