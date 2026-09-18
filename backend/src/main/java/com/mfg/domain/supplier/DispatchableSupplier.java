package com.mfg.domain.supplier;

import java.math.BigDecimal;
import java.util.UUID;

/** 可派单的供应商：组织 id、名称、折率。 */
public record DispatchableSupplier(UUID orgId, String name, BigDecimal discountRate) {
}
