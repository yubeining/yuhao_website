package com.mfg.domain.order;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

interface OpsOrderPartRepository extends JpaRepository<OpsOrderPart, UUID> {

    List<OpsOrderPart> findByOpsOrderIdOrderByCreatedAtAsc(UUID opsOrderId);

    List<OpsOrderPart> findByOpsOrderIdIn(Collection<UUID> opsOrderIds);

    /** 某客户零件行被拆进了哪几张生产订单（一行可能拆成几份）。 */
    List<OpsOrderPart> findByUpstreamPartId(UUID customerOrderPartId);

    List<OpsOrderPart> findByUpstreamPartIdIn(Collection<UUID> customerOrderPartIds);

    boolean existsByUpstreamPartId(UUID customerOrderPartId);

    long countByOpsOrderId(UUID opsOrderId);
}
