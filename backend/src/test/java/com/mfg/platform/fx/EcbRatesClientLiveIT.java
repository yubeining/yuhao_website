package com.mfg.platform.fx;

import com.mfg.config.AppProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 对着<b>真实 ECB</b> 拉一次。默认跳过（CI / 普通 {@code mvn verify} 不连外网），
 * 想验真网络时：{@code FX_IT_LIVE=true mvn verify -Dit.test=EcbRatesClientLiveIT}。
 */
@EnabledIfEnvironmentVariable(named = "FX_IT_LIVE", matches = "true")
class EcbRatesClientLiveIT {

    @Test
    void fetchesTheCurrentDailyFileFromTheRealEcb() {
        EcbRatesClient client = new EcbRatesClient(new AppProperties.Fx(true,
                "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", 10, 20));
        try {
            EcbDailyRates day = client.fetchDaily();
            assertThat(day.rates()).containsKey("CNY");
            // ECB 周末 / 节假日不更新，最新一天可能落后几天
            assertThat(day.date()).isAfter(LocalDate.now().minusDays(10));
        } finally {
            client.close();
        }
    }
}
