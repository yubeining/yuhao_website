package com.mfg.domain.order;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** 供应商订单。供应商端的查询都带供应商组织条件（CLAUDE.md §3 铁律 2）。 */
interface SupplierOrderRepository extends JpaRepository<SupplierOrder, UUID> {

    Optional<SupplierOrder> findByIdAndSupplierOrgId(UUID id, UUID supplierOrgId);

    List<SupplierOrder> findBySupplierOrgIdOrderByAcceptedAtDesc(UUID supplierOrgId);

    Optional<SupplierOrder> findByOpsOrderIdAndStatus(UUID opsOrderId, SupplierOrder.Status status);

    List<SupplierOrder> findByOpsOrderIdOrderByAcceptedAtDesc(UUID opsOrderId);

    List<SupplierOrder> findByOpsOrderIdInAndStatus(Collection<UUID> opsOrderIds, SupplierOrder.Status status);
}
