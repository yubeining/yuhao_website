package com.mfg.domain.quote;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * 运营端：某客户的报价系数。
 *
 * <p>{@code markupRate} 是这个客户自己的值（没设过为空 = 用默认）；{@code defaultRate} 是全局默认；
 * {@code effectiveRate} 是实际生效的那个（公司值优先，其次默认，两者都没有则空）。
 */
public record MarkupView(UUID customerOrgId, BigDecimal markupRate, Instant updatedAt,
                         BigDecimal defaultRate, BigDecimal effectiveRate) {
}
