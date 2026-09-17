package com.mfg.platform.fx;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

/** 把一天的汇率写进库。包内可见：别的模块只能读汇率（{@link FxRateService}），不能写。 */
@Component
class FxRateStore {

    private final FxRateRepository rates;

    FxRateStore(FxRateRepository rates) {
        this.rates = rates;
    }

    /** 一整天要么全写、要么都不写；已经有的跳过。返回新插入的行数。 */
    @Transactional
    public int saveEcbDay(EcbDailyRates day) {
        Instant fetchedAt = Instant.now();
        int inserted = 0;
        for (Map.Entry<String, BigDecimal> e : day.rates().entrySet()) {
            inserted += rates.insertIfAbsent(FxRate.SOURCE_ECB, day.date(), "EUR", e.getKey(), e.getValue(), fetchedAt);
        }
        return inserted;
    }
}
