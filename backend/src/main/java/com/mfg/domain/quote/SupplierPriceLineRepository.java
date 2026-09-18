package com.mfg.domain.quote;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/** 供应商端的查询都带供应商组织条件（CLAUDE.md §3 铁律 2）。 */
interface SupplierPriceLineRepository extends JpaRepository<SupplierPriceLine, UUID> {

    List<SupplierPriceLine> findBySupplierOrgIdOrderByCreatedAtAsc(UUID supplierOrgId);
}
