package com.mfg.platform.auth;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 验证码邮件的文案模板：一种语言一个文件，首行是主题，其余是正文。
 *
 * <h3>为什么不用 Java 字符串字面量</h3>
 * <p>项目规定后端 Java 源码不许出现非 ASCII 字符串字面量（CLAUDE.md §6）——
 * 文案要能交给翻译，不能被编译进代码。放 resources 里也便于以后上 TMS。
 *
 * <h3>为什么没走「后端只返 i18n code」那条路</h3>
 * <p>那条规则管的是 API 响应。邮件是发给收件人的内容，收件人不会去前端查表，
 * 所以必须在发信这一侧就把文案定下来。
 *
 * <h3>缺文件怎么办</h3>
 * <p>回退英文，而不是抛异常 —— 少一个语言文件不该让登录挂掉。
 */
@Component
class OtpEmailTemplate {

    private static final String FALLBACK = "en";

    private final Map<String, String[]> cache = new ConcurrentHashMap<>();

    /** @return {@code [subject, body]}，已把 {@code {code}} / {@code {minutes}} 替换掉。 */
    String[] render(String locale, String code, int ttlSeconds) {
        String[] raw = load(normalize(locale));
        return new String[]{
                raw[0],
                raw[1].replace("{code}", code).replace("{minutes}", String.valueOf(ttlSeconds / 60)),
        };
    }

    private final Map<String, String[]> named = new ConcurrentHashMap<>();

    /**
     * 按模板名渲染其他认证邮件（改密 / 重置）：{@code i18n/<name>-<语言>.txt}，
     * 正文里的 {@code {key}} 用 {@code vars} 替换。缺该语言回退英文。
     *
     * <p>和 {@link #render} 不同，英文也缺时<b>抛异常</b>：那是打包漏了资源，
     * 这些邮件没有一句"兜底文案"能代替（不像验证码，至少能把码发出去）。
     */
    String[] renderNamed(String name, String locale, Map<String, String> vars) {
        String lang = normalize(locale);
        String[] raw = named.computeIfAbsent(name + ":" + lang, key -> {
            String[] parsed = read("i18n/" + name + "-" + lang + ".txt");
            if (parsed == null && !FALLBACK.equals(lang)) {
                parsed = read("i18n/" + name + "-" + FALLBACK + ".txt");
            }
            if (parsed == null) {
                throw new IllegalStateException("missing email template i18n/" + name + "-" + FALLBACK + ".txt");
            }
            return parsed;
        });
        String body = raw[1];
        for (Map.Entry<String, String> e : vars.entrySet()) {
            body = body.replace("{" + e.getKey() + "}", e.getValue());
        }
        return new String[]{raw[0], body};
    }

    private String[] load(String locale) {
        return cache.computeIfAbsent(locale, key -> {
            String[] parsed = read("i18n/otp-email-" + key + ".txt");
            if (parsed == null && !FALLBACK.equals(key)) {
                parsed = read("i18n/otp-email-" + FALLBACK + ".txt");
            }
            if (parsed == null) {
                // 连英文模板都没有 = 打包漏了资源。给一个不含文案的兜底，
                // 让发信本身仍然成功（用户至少能收到码）
                return new String[]{"Sign-in code", "Your verification code is {code}."};
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
            int split = text.indexOf('\n');
            if (split < 0) {
                return new String[]{text, ""};
            }
            return new String[]{text.substring(0, split).strip(), text.substring(split + 1).strip()};
        } catch (IOException e) {
            throw new UncheckedIOException("failed to read " + path, e);
        }
    }

    /** {@code zh-CN} → {@code zh}；不认识的直接给 fallback。 */
    private static String normalize(String locale) {
        if (locale == null || locale.isBlank()) {
            return FALLBACK;
        }
        String base = locale.trim().toLowerCase().split("[-_]")[0];
        return switch (base) {
            case "zh" -> "zh";
            case "en" -> "en";
            default -> FALLBACK;
        };
    }
}
