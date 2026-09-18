package com.mfg.domain.order;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** 生产订单。运营端跨客户，没有租户条件；供应商端的可见性由服务层按派单记录判。 */
interface OpsOrderRepository extends JpaRepository<OpsOrder, UUID> {

    /** 带行锁取（{@code SELECT … FOR UPDATE}），锁到事务结束。派单、接单、拒接、收回、退单、分配都先拿这把锁。 */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from OpsOrder o where o.id = :id")
    Optional<OpsOrder> lockById(@Param("id") UUID id);

    List<OpsOrder> findAllByOrderByCreatedAtDesc();

    List<OpsOrder> findByStatusOrderByCreatedAtDesc(OpsOrder.Status status);

    List<OpsOrder> findByIdInAndStatus(Collection<UUID> ids, OpsOrder.Status status);

    List<OpsOrder> findByStatusOrderByDispatchedAtDesc(OpsOrder.Status status);
}
