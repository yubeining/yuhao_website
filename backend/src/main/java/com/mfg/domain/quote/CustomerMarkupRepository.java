package com.mfg.domain.quote;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

interface CustomerMarkupRepository extends JpaRepository<CustomerMarkup, UUID> {

    Optional<CustomerMarkup> findByCustomerOrgId(UUID customerOrgId);
}
