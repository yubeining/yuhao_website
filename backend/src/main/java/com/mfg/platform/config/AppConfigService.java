package com.mfg.platform.config;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

/**
 * 业务配置的读写入口（{@code app_setting} 表）。
 *
 * <p>现在只放「报价系数的全局默认值」一个键 —— 加新键时在这里补一对读写方法，
 * 别在业务代码里直接碰 {@link AppSetting} / 仓库。
 *
 * <p>★ 没有默认值时返回 {@link Optional#empty()}，<b>不自己编一个数</b>（CLAUDE.md §10 C5）：
 * 报价端会明确报「未设置默认报价系数」，由运营在设置页填。
 */
@Service
public class AppConfigService {

    /** 报价系数的全局默认值（jsonb 数字）。 */
    public static final String KEY_QUOTE_DEFAULT_MARKUP = "quote.default-markup-rate";

    private final AppSettingRepository settings;

    AppConfigService(AppSettingRepository settings) {
        this.settings = settings;
    }

    @Transactional(readOnly = true)
    public Optional<BigDecimal> quoteDefaultMarkupRate() {
        return settings.findRawValue(KEY_QUOTE_DEFAULT_MARKUP)
                .map(String::trim)
                .filter(raw -> !raw.isEmpty())
                .map(BigDecimal::new);
    }

    @Transactional
    public BigDecimal setQuoteDefaultMarkupRate(BigDecimal rate) {
        settings.upsertNumber(UUID.randomUUID(), KEY_QUOTE_DEFAULT_MARKUP, rate.toPlainString(),
                "Default markup rate applied to customers without their own value");
        return rate;
    }
}
