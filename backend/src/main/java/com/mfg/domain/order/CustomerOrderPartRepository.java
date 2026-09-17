package com.mfg.domain.order;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** 客户订单的零件行。所有查询都带客户组织条件(CLAUDE.md §3 铁律 2)。 */
interface CustomerOrderPartRepository extends JpaRepository<CustomerOrderPart, UUID> {

    List<CustomerOrderPart> findByCustomerOrderIdAndCustomerOrgIdOrderByCreatedAtAsc(UUID customerOrderId,
                                                                                   UUID customerOrgId);

    Optional<CustomerOrderPart> findByIdAndCustomerOrderIdAndCustomerOrgId(UUID id, UUID customerOrderId,
                                                                          UUID customerOrgId);

    /** 列表页的行数和总件数：[订单 id, 行数, 数量之和]。一次查完一页，不按订单逐个查。 */
    @Query("select l.customerOrderId, count(l), coalesce(sum(l.quantity), 0) from CustomerOrderPart l"
            + " where l.customerOrderId in :orderIds and l.customerOrgId = :orgId group by l.customerOrderId")
    List<Object[]> summarize(@Param("orderIds") Collection<UUID> orderIds, @Param("orgId") UUID customerOrgId);

    /** 同 {@link #summarize}，运营端跨客户用：订单 id 来自运营端列表本身，不来自请求。 */
    @Query("select l.customerOrderId, count(l), coalesce(sum(l.quantity), 0) from CustomerOrderPart l"
            + " where l.customerOrderId in :orderIds group by l.customerOrderId")
    List<Object[]> summarizeAcrossCustomers(@Param("orderIds") Collection<UUID> orderIds);
}
