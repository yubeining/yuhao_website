package com.mfg.domain.order;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

interface SupplierOrderPartRepository extends JpaRepository<SupplierOrderPart, UUID> {

    List<SupplierOrderPart> findBySupplierOrderIdOrderByCreatedAtAsc(UUID supplierOrderId);

    List<SupplierOrderPart> findBySupplierOrderIdIn(Collection<UUID> supplierOrderIds);
}
