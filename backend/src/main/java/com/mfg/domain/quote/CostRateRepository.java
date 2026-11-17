package com.mfg.domain.quote;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface CostRateRepository extends JpaRepository<CostRate, UUID> {

    List<CostRate> findAllByOrderByKindAscNameAsc();

    Optional<CostRate> findByKindAndName(CostRate.Kind kind, String name);
}
