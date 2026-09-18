package com.mfg.domain.order;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * 订单域发布给报价域的派单契约：对供价要按生产订单的行算（原价在报价行上，折率在供应商域）。
 * 依赖方向「报价 → 订单」，订单域不知道价格。
 */
public interface OrderDispatching {

    /** 运营端：这张生产订单的行。不存在 → 404。 */
    List<DispatchLine> opsOrderLines(UUID opsOrderId);

    /** 供应商端：这些生产订单里此刻派给这家（或挂在市场上、他可接）的那几张的行；看不到的不在结果里。 */
    List<DispatchLine> openLinesFor(UUID supplierOrgId, Collection<UUID> opsOrderIds);
}
