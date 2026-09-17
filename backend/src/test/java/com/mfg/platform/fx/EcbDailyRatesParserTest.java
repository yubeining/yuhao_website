package com.mfg.platform.fx;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * ECB 每日参考汇率 XML 的解析。
 *
 * <p>两份样本：{@code ecb-daily-small.xml} 是照 ECB 真实结构手写的（数值已知，能精确断言）；
 * {@code ecb-daily-real.xml} 是 2026-09-17 从 ECB 原样下载的（数值会变，只断言形状）。
 *
 * <p>原则：格式不对就整份拒绝，绝不返回半截数据 —— 半截数据入库后，报价会拿着不完整的汇率去算。
 */
class EcbDailyRatesParserTest {

    @Test
    void parsesTheDateAndEveryCurrency() throws IOException {
        EcbDailyRates rates = EcbDailyRatesParser.parse(resource("fx/ecb-daily-small.xml"));

        assertThat(rates.date()).isEqualTo(LocalDate.of(2026, 9, 16));
        assertThat(rates.rates()).containsOnlyKeys("USD", "CNY");
        assertThat(rates.rates().get("CNY")).isEqualByComparingTo(new BigDecimal("7.7380"));
        assertThat(rates.rates().get("USD")).isEqualByComparingTo(new BigDecimal("1.1551"));
    }

    /** 真实下载的文件：结构对得上，币种齐，人民币在里面。 */
    @Test
    void parsesARealEcbFile() throws IOException {
        EcbDailyRates rates = EcbDailyRatesParser.parse(resource("fx/ecb-daily-real.xml"));

        assertThat(rates.date()).isNotNull();
        assertThat(rates.rates()).hasSizeGreaterThanOrEqualTo(20).containsKey("CNY");
        assertThat(rates.rates().values()).allMatch(r -> r.signum() > 0);
    }

    @Test
    void rejectsSomethingThatIsNotXml() {
        assertRejected("<html>maintenance</html");
        assertRejected("");
    }

    @Test
    void rejectsAFileWithoutADate() {
        assertRejected(ecb("<Cube><Cube currency='CNY' rate='7.7380'/></Cube>"));
    }

    @Test
    void rejectsADateWithNoRates() {
        assertRejected(ecb("<Cube time='2026-09-16'></Cube>"));
    }

    /** 每日文件只有一天。出现两天说明拿到的不是每日文件（比如 90 天文件），整份拒绝。 */
    @Test
    void rejectsMoreThanOneDay() {
        assertRejected(ecb("<Cube time='2026-09-16'><Cube currency='CNY' rate='7.7380'/></Cube>"
                + "<Cube time='2026-09-15'><Cube currency='CNY' rate='7.7400'/></Cube>"));
    }

    /** 一个币种坏了，整份拒绝 —— 不能只存其余的。 */
    @Test
    void rejectsTheWholeFileIfOneRateIsNotANumber() {
        assertRejected(ecb("<Cube time='2026-09-16'><Cube currency='USD' rate='1.1551'/>"
                + "<Cube currency='CNY' rate='n/a'/></Cube>"));
    }

    @Test
    void rejectsNonPositiveRates() {
        assertRejected(ecb("<Cube time='2026-09-16'><Cube currency='CNY' rate='0'/></Cube>"));
        assertRejected(ecb("<Cube time='2026-09-16'><Cube currency='CNY' rate='-7.7'/></Cube>"));
    }

    @Test
    void rejectsMalformedCurrencyCodes() {
        assertRejected(ecb("<Cube time='2026-09-16'><Cube currency='cny' rate='7.7'/></Cube>"));
        assertRejected(ecb("<Cube time='2026-09-16'><Cube currency='YUAN' rate='7.7'/></Cube>"));
    }

    @Test
    void rejectsAnUnparseableDate() {
        assertRejected(ecb("<Cube time='16/09/2026'><Cube currency='CNY' rate='7.7'/></Cube>"));
    }

    /**
     * 外部实体（XXE）必须被拒：拉取的是外网内容，不能让它指挥解析器去读本机文件或发请求。
     * 做法是直接禁止 DOCTYPE —— ECB 的文件里本来就没有。
     */
    @Test
    void rejectsDoctypeSoExternalEntitiesCannotBeResolved() {
        String xxe = "<?xml version=\"1.0\"?>"
                + "<!DOCTYPE e [<!ENTITY x SYSTEM \"file:///etc/hosts\">]>"
                + "<gesmes:Envelope xmlns:gesmes=\"http://www.gesmes.org/xml/2002-08-01\""
                + " xmlns=\"http://www.ecb.int/vocabulary/2002-08-01/eurofxref\">"
                + "<Cube><Cube time='2026-09-16'><Cube currency='CNY' rate='&x;'/></Cube></Cube>"
                + "</gesmes:Envelope>";
        assertRejected(xxe);
    }

    // ---------- helpers ----------

    private static String ecb(String cubes) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                + "<gesmes:Envelope xmlns:gesmes=\"http://www.gesmes.org/xml/2002-08-01\""
                + " xmlns=\"http://www.ecb.int/vocabulary/2002-08-01/eurofxref\">"
                + "<gesmes:subject>Reference rates</gesmes:subject>"
                + "<Cube>" + cubes + "</Cube>"
                + "</gesmes:Envelope>";
    }

    private static void assertRejected(String xml) {
        assertThatThrownBy(() -> EcbDailyRatesParser.parse(xml.getBytes(StandardCharsets.UTF_8)))
                .isInstanceOf(EcbRatesFormatException.class);
    }

    private static byte[] resource(String path) throws IOException {
        try (InputStream in = EcbDailyRatesParserTest.class.getClassLoader().getResourceAsStream(path)) {
            assertThat(in).as(path).isNotNull();
            return in.readAllBytes();
        }
    }
}
