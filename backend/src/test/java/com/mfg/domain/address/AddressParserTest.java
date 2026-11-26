package com.mfg.domain.address;

import com.mfg.common.exception.BusinessException;
import com.mfg.platform.ai.AiException;
import com.mfg.platform.ai.AiRequest;
import com.mfg.platform.ai.AiResult;
import com.mfg.platform.ai.AiService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 智能粘贴（2026-11-26 P2：走现有 AI 服务）。AI 一律 mock，只测我们自己对模型输出的处理。 */
class AddressParserTest {

    private final AiService ai = mock(AiService.class);
    private final ObjectMapper json = JsonMapper.builder().build();
    private final AddressParser parser = new AddressParser(ai, json, "qwen3.8-max");

    @Test
    void mapsTheModelOutputOntoTheAddressFields() {
        reply("""
                Here you go:
                {"country":"DE","company":" Beispiel GmbH ","contact":"Max Mustermann","phone":"+49 30 0000 0000",
                 "line1":"Musterstrasse 1","line2":"2. OG","city":"Berlin","region":null,"postalCode":"10115"}
                """);

        ParsedAddressView p = parser.parse("Beispiel GmbH, Max Mustermann ...");

        assertThat(p.country()).isEqualTo("DE");
        assertThat(p.company()).isEqualTo("Beispiel GmbH");
        assertThat(p.contact()).isEqualTo("Max Mustermann");
        assertThat(p.phone()).isEqualTo("+49 30 0000 0000");
        assertThat(p.line1()).isEqualTo("Musterstrasse 1");
        assertThat(p.line2()).isEqualTo("2. OG");
        assertThat(p.city()).isEqualTo("Berlin");
        assertThat(p.region()).isNull();
        assertThat(p.postalCode()).isEqualTo("10115");
    }

    @Test
    void sendsThePastedTextAsTheUserMessage() {
        reply("{}");
        parser.parse("1 Sample Road, Leeds");
        ArgumentCaptor<AiRequest> req = ArgumentCaptor.forClass(AiRequest.class);
        verify(ai).chat(req.capture());
        assertThat(req.getValue().user()).isEqualTo("1 Sample Road, Leeds");
        assertThat(req.getValue().system()).isNotBlank();
        // 用配置的模型（2026-11-26 需求方定 qwen3.8-max），不能留空让网关 / Spring AI 去猜
        assertThat(req.getValue().model()).isEqualTo("qwen3.8-max");
    }

    @Test
    void dropsCountriesThatAreNotIsoCodesAndBlankValues() {
        reply("{\"country\":\"Germany\",\"company\":\"  \",\"city\":\"Berlin\"}");
        ParsedAddressView p = parser.parse("x");
        assertThat(p.country()).isNull();
        assertThat(p.company()).isNull();
        assertThat(p.city()).isEqualTo("Berlin");

        reply("{\"country\":\"XX\"}");
        assertThat(parser.parse("x").country()).isNull();

        reply("{\"country\":\"gb\"}");
        assertThat(parser.parse("x").country()).isEqualTo("GB");
    }

    @Test
    void dropsValuesLongerThanTheFormAccepts() {
        reply("{\"postalCode\":\"" + "9".repeat(21) + "\",\"city\":\"Leeds\"}");
        ParsedAddressView p = parser.parse("x");
        assertThat(p.postalCode()).isNull();
        assertThat(p.city()).isEqualTo("Leeds");
    }

    @Test
    void aiFailureOrUnreadableOutputIsABadGateway() {
        when(ai.chat(any())).thenThrow(new AiException("down", null));
        assertThatThrownBy(() -> parser.parse("x"))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getMessage())
                        .isEqualTo("address.parse_failed"));

        reply("sorry, I cannot help with that");
        assertThatThrownBy(() -> parser.parse("x"))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getMessage())
                        .isEqualTo("address.parse_failed"));
    }

    private void reply(String content) {
        // doReturn 而不是 when(...)：前一步可能已把 chat 设成抛异常，when(ai.chat(..)) 会真的调到它
        doReturn(new AiResult(content, "test-model", null, null)).when(ai).chat(any());
    }
}
