package com.mfg.domain.supplier;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 供应商域发布给订单域、报价域的契约（CLAUDE.md §2：跨域只走接口 + record）。
 *
 * <p>「可派单」= 组织是 SUPPLIER、状态 ACTIVE、运营录了折率（2026-09-18 拍板：录好折率就能派）。
 */
public interface SupplierDirectory {

    /** 这家的折率。没录、不是供应商、已停用 → 空。 */
    Optional<BigDecimal> discountOf(UUID supplierOrgId);

    /** 现在可以派单的全部供应商，新入驻的在前。 */
    List<DispatchableSupplier> dispatchable();
}
