package com.mfg.domain.quote;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** 客户端的查询都带客户组织条件（CLAUDE.md §3 铁律 2）；运营端按订单 id 查（订单已由订单域校验过可见）。 */
interface QuoteRepository extends JpaRepository<Quote, UUID> {

    @Query("select coalesce(max(q.versionNo), 0) from Quote q where q.customerOrderId = :orderId")
    int maxVersionNo(@Param("orderId") UUID customerOrderId);

    Optional<Quote> findByCustomerOrderIdAndStatus(UUID customerOrderId, Quote.Status status);

    List<Quote> findByCustomerOrderIdOrderByVersionNoDesc(UUID customerOrderId);

    Optional<Quote> findByIdAndCustomerOrderIdAndCustomerOrgId(UUID id, UUID customerOrderId, UUID customerOrgId);

    Optional<Quote> findFirstByCustomerOrderIdAndCustomerOrgIdAndStatusInOrderByVersionNoDesc(
            UUID customerOrderId, UUID customerOrgId, Collection<Quote.Status> statuses);

    Page<Quote> findByCustomerOrgIdAndStatusIn(UUID customerOrgId, Collection<Quote.Status> statuses,
                                              Pageable pageable);
}
