package com.mfg.domain.quote;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 报价通知邮件的文案模板：一种语言一个文件，首行主题、其余正文（同 {@code OtpEmailTemplate}）。
 *
 * <p>为什么放 resources 而不是 Java 字面量：后端源码不许出现非 ASCII 字面量（CLAUDE.md §6），
 * 而且文案要能交给翻译。
 *
 * <p>缺语言文件回退英文 —— 少一个翻译不该让报价发不出去（邮件是异步的，失败了客户只会"没收到"）。
 */
@Component
class QuoteEmailTemplate {

    private static final String FALLBACK = "en";

    private final Map<String, String[]> cache = new ConcurrentHashMap<>();

    /** @return {@code [subject, body]} */
    String[] render(String locale, String orderTitle, String amount, String currency, String commitDate) {
        String[] raw = load(normalize(locale));
        return new String[]{
                raw[0].replace("{order}", orderTitle),
                raw[1].replace("{order}", orderTitle)
                        .replace("{amount}", amount)
                        .replace("{currency}", currency)
                        .replace("{date}", commitDate),
        };
    }

    private String[] load(String locale) {
        return cache.computeIfAbsent(locale, key -> {
            String[] parsed = read("i18n/quote-email-" + key + ".txt");
            if (parsed == null && !FALLBACK.equals(key)) {
                parsed = read("i18n/quote-email-" + FALLBACK + ".txt");
            }
            if (parsed == null) {
                return new String[]{"Quotation ready for {order}",
                        "Your quotation for {order} is {currency} {amount} with a {days}-day lead time. "
                                + "Open the customer portal to review it."};
            }
            return parsed;
        });
    }

    private String[] read(String path) {
        ClassPathResource resource = new ClassPathResource(path);
        if (!resource.exists()) {
            return null;
        }
        try (InputStream in = resource.getInputStream()) {
            String text = new String(in.readAllBytes(), StandardCharsets.UTF_8).strip();
            String[] lines = text.split("\\R", 2);
            return lines.length == 2 ? new String[]{lines[0].strip(), lines[1].strip()} : null;
        } catch (IOException e) {
            throw new UncheckedIOException("failed to read " + path, e);
        }
    }

    private static String normalize(String locale) {
        if (locale == null || locale.isBlank()) {
            return FALLBACK;
        }
        String tag = locale.trim().toLowerCase();
        return tag.startsWith("zh") ? "zh" : FALLBACK;
    }
}
