package com.mfg.domain.quote;

import com.mfg.common.exception.BusinessException;
import com.mfg.domain.order.DrawingContent;
import com.mfg.domain.order.EstimateSource;
import com.mfg.domain.order.OrderQuoting;
import com.mfg.platform.ai.AiException;
import com.mfg.platform.ai.AiRequest;
import com.mfg.platform.ai.AiResult;
import com.mfg.platform.ai.AiService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** AI 成本估算的流程：读图 → 调模型 → 解析 → 按费率算 → 存快照；以及三种失败。 */
class EstimateServiceTest {

    private static final UUID USER = UUID.randomUUID();
    private static final UUID OPS_ORG = UUID.randomUUID();
    private static final UUID ORDER = UUID.randomUUID();
    private static final UUID LINE = UUID.randomUUID();
    private static final UUID CUSTOMER = UUID.randomUUID();

    private final OrderQuoting orders = mock(OrderQuoting.class);
    private final CostRateService rates = mock(CostRateService.class);
    private final PriceEstimateRepository repo = mock(PriceEstimateRepository.class);
    private final AiService ai = mock(AiService.class);
    private final ObjectMapper json = JsonMapper.builder().build();
    private EstimateService service;

    @BeforeEach
    void setUp() {
        service = new EstimateService(orders, rates, repo, ai, json, "qwen3.8-flash");
        when(rates.snapshot()).thenReturn(List.of(
                new CostRateSnapshot("MATERIAL", "steel", "KG", new BigDecimal("9.00")),
                new CostRateSnapshot("PROCESS", "milling", "HOUR", new BigDecimal("140.00"))));
        when(repo.save(any(PriceEstimate.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void machinedPartIsEstimatedFromTheRateTableAndSnapshotted() throws IOException {
        givenDrawings(List.of(new DrawingContent(UUID.randomUUID(), "a.png", png())), List.of("a.step"));
        givenAiReplies("```json\n{\"partType\":\"MACHINED\",\"partTypeReason\":\"r\",\"material\":\"C45\","
                + "\"materialRate\":\"steel\",\"netWeightKg\":1,\"blankWeightKg\":2,"
                + "\"processes\":[{\"rate\":\"milling\",\"quantity\":0.5,\"note\":null}],\"outsource\":[],"
                + "\"fixedCostCny\":100,\"fixedCostNote\":\"setup\",\"assumptions\":[\"a1\"],\"toConfirm\":[\"c1\"]}\n```");

        PriceEstimateView v = service.estimate(USER, OPS_ORG, ORDER, LINE);

        // 2 kg × 9 = 18；0.5 h × 140 = 70；固定 100 → 188（数量 1，系数都是 1）
        assertThat(v.outcome()).isEqualTo("ESTIMATED");
        assertThat(v.unitCostCny()).isEqualByComparingTo("188.00");
        assertThat(v.complete()).isTrue();
        assertThat(v.assumptions()).containsExactly("a1");
        assertThat(v.toConfirm()).containsExactly("c1");
        assertThat(v.readFiles()).containsExactly("a.png");
        assertThat(v.skippedFiles()).containsExactly("a.step");
        assertThat(v.lineId()).isEqualTo(LINE);

        ArgumentCaptor<AiRequest> req = ArgumentCaptor.forClass(AiRequest.class);
        verify(ai).chat(req.capture());
        assertThat(req.getValue().model()).isEqualTo("qwen3.8-flash");
        assertThat(req.getValue().images()).hasSize(1);
        assertThat(req.getValue().user()).contains("milling | HOUR").doesNotContain("140");

        ArgumentCaptor<PriceEstimate> saved = ArgumentCaptor.forClass(PriceEstimate.class);
        verify(repo).save(saved.capture());
        assertThat(saved.getValue().getInputSnapshot().get("rates")).hasSize(2);
        assertThat(saved.getValue().getModel()).isEqualTo("qwen3.8-flash");
    }

    @Test
    void nonMachinedPartIsRecordedWithoutACost() throws IOException {
        givenDrawings(List.of(new DrawingContent(UUID.randomUUID(), "a.png", png())), List.of());
        givenAiReplies("{\"partType\":\"OTHER\",\"partTypeReason\":\"sheet metal\"}");

        PriceEstimateView v = service.estimate(USER, OPS_ORG, ORDER, LINE);

        assertThat(v.outcome()).isEqualTo("NOT_MACHINED");
        assertThat(v.unitCostCny()).isNull();
        assertThat(v.partTypeReason()).isEqualTo("sheet metal");
        assertThat(v.breakdown().items()).isEmpty();
    }

    @Test
    void noReadableDrawingStopsBeforeCallingTheModel() {
        givenDrawings(List.of(new DrawingContent(UUID.randomUUID(), "broken.pdf", new byte[]{1, 2})), List.of());

        assertThatThrownBy(() -> service.estimate(USER, OPS_ORG, ORDER, LINE))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("messageCode", "estimate.no_readable_drawing");
        verify(ai, never()).chat(any());
    }

    @Test
    void modelFailureBecomes502() throws IOException {
        givenDrawings(List.of(new DrawingContent(UUID.randomUUID(), "a.png", png())), List.of());
        when(ai.chat(any())).thenThrow(new AiException("down", null));

        assertThatThrownBy(() -> service.estimate(USER, OPS_ORG, ORDER, LINE))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("code", 502)
                .hasFieldOrPropertyWithValue("messageCode", "estimate.ai_failed");
        verify(repo, never()).save(any());
    }

    @Test
    void unparseableOutputBecomes502() throws IOException {
        givenDrawings(List.of(new DrawingContent(UUID.randomUUID(), "a.png", png())), List.of());
        givenAiReplies("sorry, I cannot read this drawing");

        assertThatThrownBy(() -> service.estimate(USER, OPS_ORG, ORDER, LINE))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("messageCode", "estimate.ai_bad_output");
        verify(repo, never()).save(any());
    }

    @Test
    void failureReasonIsWrittenAsTextIncludingTheCauseChain() {
        String reason = EstimateService.describe(new AiException("AI chat call failed",
                new RuntimeException("HTTP 404 -\n {\"error\":\"model not found\"}")));

        assertThat(reason).isEqualTo("AiException: AI chat call failed <- RuntimeException: HTTP 404 - {\"error\":\"model not found\"}");
    }

    @Test
    void extractJsonStripsFencesAndChatter() {
        assertThat(EstimateService.extractJson("here:\n```json\n{\"a\":{\"b\":1}}\n```\nbye"))
                .isEqualTo("{\"a\":{\"b\":1}}");
    }

    private void givenDrawings(List<DrawingContent> drawings, List<String> skipped) {
        when(orders.readForEstimate(eq(USER), eq(OPS_ORG), eq(ORDER), eq(LINE), any(), anyLong(), anyInt()))
                .thenReturn(new EstimateSource(ORDER, LINE, CUSTOMER, "P-1", "bracket", 1, "C45", null,
                        drawings, skipped));
    }

    private void givenAiReplies(String content) {
        when(ai.chat(any())).thenReturn(new AiResult(content, null, 10, 10));
    }

    private static byte[] png() throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(100, 80, BufferedImage.TYPE_INT_RGB), "png", out);
        return out.toByteArray();
    }
}
