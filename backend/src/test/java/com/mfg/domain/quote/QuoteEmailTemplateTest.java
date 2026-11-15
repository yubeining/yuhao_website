package com.mfg.domain.quote;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 报价邮件模板：文件真的被打进包里、占位符都被替换、缺语言时回退英文。
 */
class QuoteEmailTemplateTest {

    private final QuoteEmailTemplate template = new QuoteEmailTemplate();

    @Test
    void chineseTemplateReplacesPlaceholders() {
        String[] mail = template.render("zh-CN", "法兰盘 500 件", "12,340.00", "EUR", 30);
        assertThat(mail[0]).contains("法兰盘 500 件");
        assertThat(mail[1]).contains("12,340.00", "EUR", "30");
        assertThat(mail[1]).doesNotContain("{order}", "{amount}", "{currency}", "{days}");
    }

    @Test
    void unknownLocaleFallsBackToEnglish() {
        String[] mail = template.render("fr", "Bracket 200", "8,900.00", "EUR", 25);
        assertThat(mail[0]).contains("Your quotation is ready");
        assertThat(mail[1]).contains("8,900.00", "25");
    }
}
