package com.mfg.platform.fx;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 汇率的只读入口。
 *
 * <p>★ 只给「数据源公布了什么」，<b>不做换算</b>（CNY→EUR、交叉汇率、四舍五入、buffer、锁定都没定，
 * 见设计文档 13 §3.1），等报价（第 3 步）定了政策再加。
 */
@Service
public class FxRateService {

    private final FxRateRepository rates;

    FxRateService(FxRateRepository rates) {
        this.rates = rates;
    }

    /** ECB 最近一天公布的全部汇率（1 EUR 兑各币种）。还没拉到过时返回空列表。 */
    @Transactional(readOnly = true)
    public List<FxRateView> latestEcbRates() {
        return rates.findLatestBatch(FxRate.SOURCE_ECB).stream().map(FxRateView::of).toList();
    }
}
