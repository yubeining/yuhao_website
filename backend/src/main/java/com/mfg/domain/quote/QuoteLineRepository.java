package com.mfg.domain.quote;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

interface QuoteLineRepository extends JpaRepository<QuoteLine, UUID> {

    List<QuoteLine> findByQuoteIdInAndCustomerOrgIdOrderByLineNoAsc(Collection<UUID> quoteIds, UUID customerOrgId);

    /** 这些客户零件行在客户确认的那一版报价上的行 —— 对供价的原价从这里取。 */
    @Query("select l from QuoteLine l, Quote q where q.id = l.quoteId and q.status = :status"
            + " and l.customerOrderPartId in :lineIds")
    List<QuoteLine> findByQuoteStatusAndCustomerOrderPartIdIn(@Param("status") Quote.Status status,
                                                             @Param("lineIds") Collection<UUID> customerOrderPartIds);
}
