package com.mfg.domain.quote;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

interface PriceEstimateRepository extends JpaRepository<PriceEstimate, UUID> {

    /** 这张单所有估算，新的在前 —— 调用方每行取第一条。 */
    List<PriceEstimate> findByCustomerOrderIdOrderByCreatedAtDesc(UUID customerOrderId);
}
