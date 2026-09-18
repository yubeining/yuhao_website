package com.mfg.domain.order;

import java.util.List;
import java.util.UUID;

/**
 * 领域事件：供应商接下了一张生产订单。<b>同步、同一事务</b>发布 —— 报价域在监听里写对供价快照，
 * 写不成（比如找不到客户确认的原价）就抛异常，整个接单回滚。
 */
public record SupplierOrderAccepted(UUID supplierOrderId, UUID supplierOrgId, List<Line> lines) {

    public record Line(UUID supplierOrderLineId, UUID customerOrderPartId, int quantity) {
    }
}
