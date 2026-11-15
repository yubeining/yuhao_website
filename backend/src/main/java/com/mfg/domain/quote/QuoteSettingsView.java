package com.mfg.domain.quote;

import com.mfg.common.dto.PagedResponse;

import java.math.BigDecimal;

/** 运营「报价设置」页：全局默认系数（可编辑）+ 每个客户公司的系数（只读概览）。 */
public record QuoteSettingsView(BigDecimal defaultRate, PagedResponse<QuoteCompanyRate> companies) {
}
