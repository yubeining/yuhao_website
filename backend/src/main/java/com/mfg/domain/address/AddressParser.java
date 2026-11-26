package com.mfg.domain.address;

import com.mfg.common.exception.BusinessException;
import com.mfg.platform.ai.AiException;
import com.mfg.platform.ai.AiRequest;
import com.mfg.platform.ai.AiResult;
import com.mfg.platform.ai.AiService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

/**
 * 智能粘贴：把用户粘贴的一段地址交给现有 AI 服务拆成表单字段（2026-11-26 P2，需求方选了 AI 方案）。
 *
 * <p>只拆不存：结果预填进新增弹框，用户检查、修改后自己点保存，保存时照常走必填和长度校验。
 * 所以这里不追求「拆出来一定对」，只保证拆出来的东西形状合法：国家必须是 ISO 代码、超过表单上限的值丢掉。
 *
 * <p>模型用 provider 的默认模型（{@code spring.ai.openai.chat.options.model}），不另配。
 *
 * <p>★ 地址是个人信息：原文和模型输出都不写进日志，日志只记长度（CLAUDE.md §6）。
 */
@Component
class AddressParser {

    private static final Logger log = LoggerFactory.getLogger(AddressParser.class);

    private static final Set<String> ISO_COUNTRIES = Set.of(Locale.getISOCountries());

    /** 各字段长度上限，和 {@link CustomerShippingAddressController.AddressRequest} 一致。 */
    private static final int LONG = 200;
    private static final int PHONE = 50;
    private static final int CITY = 100;
    private static final int POSTAL = 20;

    private static final String SYSTEM_PROMPT = loadPrompt();

    private final AiService ai;
    private final ObjectMapper json;

    AddressParser(AiService ai, ObjectMapper json) {
        this.ai = ai;
        this.json = json;
    }

    ParsedAddressView parse(String text) {
        AiResult result;
        try {
            result = ai.chat(new AiRequest(null, SYSTEM_PROMPT, text, null, 0.0, 600));
        } catch (AiException e) {
            log.warn("Address parse AI call failed: inputLength={} reason={}", text.length(), e.getClass().getSimpleName());
            throw new BusinessException(502, "address.parse_failed");
        }
        JsonNode n;
        try {
            n = json.readTree(extractJson(result.content()));
        } catch (JacksonException | IllegalArgumentException e) {
            log.warn("Address parse AI output is not JSON: outputLength={}",
                    result.content() == null ? 0 : result.content().length());
            throw new BusinessException(502, "address.parse_failed");
        }
        return new ParsedAddressView(country(n), text(n, "company", LONG), text(n, "contact", LONG),
                text(n, "phone", PHONE), text(n, "line1", LONG), text(n, "line2", LONG), text(n, "city", CITY),
                text(n, "region", CITY), text(n, "postalCode", POSTAL));
    }

    private static String country(JsonNode n) {
        String v = text(n, "country", 2);
        if (v == null) {
            return null;
        }
        String code = v.toUpperCase(Locale.ROOT);
        return ISO_COUNTRIES.contains(code) ? code : null;
    }

    /** 取字符串值：去首尾空白；空白、非字符串、超过上限的一律当没拆出来。 */
    private static String text(JsonNode n, String field, int max) {
        JsonNode v = n.get(field);
        if (v == null || !v.isString()) {
            return null;
        }
        String s = v.asString().trim();
        return s.isEmpty() || s.length() > max ? null : s;
    }

    private static String extractJson(String content) {
        if (content == null) {
            throw new IllegalArgumentException("empty AI output");
        }
        int start = content.indexOf('{');
        int end = content.lastIndexOf('}');
        if (start < 0 || end <= start) {
            throw new IllegalArgumentException("no JSON object in AI output");
        }
        return content.substring(start, end + 1);
    }

    private static String loadPrompt() {
        try {
            return new String(new ClassPathResource("prompts/address-parse.txt").getContentAsByteArray(),
                    StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
