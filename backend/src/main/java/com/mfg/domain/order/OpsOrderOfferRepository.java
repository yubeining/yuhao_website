package com.mfg.domain.order;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface OpsOrderOfferRepository extends JpaRepository<OpsOrderOffer, UUID> {

    List<OpsOrderOffer> findByOpsOrderIdAndDispatchRound(UUID opsOrderId, int dispatchRound);

    Optional<OpsOrderOffer> findByOpsOrderIdAndDispatchRoundAndSupplierOrgId(UUID opsOrderId, int dispatchRound,
                                                                           UUID supplierOrgId);

    List<OpsOrderOffer> findByOpsOrderIdOrderByDispatchRoundDescCreatedAtAsc(UUID opsOrderId);

    List<OpsOrderOffer> findBySupplierOrgIdAndStatus(UUID supplierOrgId, OpsOrderOffer.Status status);

    List<OpsOrderOffer> findBySupplierOrgIdAndOpsOrderIdIn(UUID supplierOrgId, Collection<UUID> opsOrderIds);
}
