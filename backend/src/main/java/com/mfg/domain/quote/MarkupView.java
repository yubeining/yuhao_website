package com.mfg.domain.quote;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** 运营端：某客户的加成率。还没设过时 {@code markupRate} / {@code updatedAt} 为空。 */
public record MarkupView(UUID customerOrgId, BigDecimal markupRate, Instant updatedAt) {
}
