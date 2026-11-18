package com.mfg.domain.quote;

import com.mfg.common.exception.BusinessException;
import com.mfg.domain.order.DrawingContent;
import com.mfg.domain.order.EstimateSource;
import com.mfg.domain.order.OrderQuoting;
import com.mfg.platform.ai.AiException;
import com.mfg.platform.ai.AiImage;
import com.mfg.platform.ai.AiRequest;
import com.mfg.platform.ai.AiResult;
import com.mfg.platform.ai.AiService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * AI 成本估算（需求方 2026-11-17 拍板）：运营点按钮 → 读这一行的图纸 → 看图模型给出零件类型、重量、工时、外协 →
 * {@link EstimateCalculator} 按费率表算每件成本 → 存快照 → 给运营参考。<b>原价仍由运营自己填</b>，这里不写任何价格。
 *
 * <p>第一版只估机加件；AI 判断不是机加件的记一行 NOT_MACHINED，不算钱。
 *
 * <p>★ 不开事务：看图模型一次要十几秒到一分钟，不能拿着数据库连接等。读图（含审计）和存结果各自一个短事务。
 */
@Service
class EstimateService {

    private static final Logger log = LoggerFactory.getLogger(EstimateService.class);

    /** 单份图纸大小上限、最多读几份、每份 PDF 最多几页、总共最多几张图 —— 控制请求体积和费用的工程值。 */
    static final long MAX_FILE_BYTES = 30L * 1024 * 1024;
    static final int MAX_FILES = 3;
    static final int MAX_PDF_PAGES = 2;
    static final int MAX_IMAGES = 4;

    private final OrderQuoting orders;
    private final CostRateService rates;
    private final PriceEstimateRepository estimates;
    private final AiService ai;
    private final ObjectMapper json;
    private final String model;
    private final String systemPrompt;

    EstimateService(OrderQuoting orders, CostRateService rates, PriceEstimateRepository estimates, AiService ai,
                    ObjectMapper json, @Value("${app.estimate.model}") String model) {
        this.orders = orders;
        this.rates = rates;
        this.estimates = estimates;
        this.ai = ai;
        this.json = json;
        this.model = model;
        this.systemPrompt = loadPrompt();
    }

    public PriceEstimateView estimate(UUID opsUserId, UUID opsOrgId, UUID orderId, UUID lineId) {
        EstimateSource src = orders.readForEstimate(opsUserId, opsOrgId, orderId, lineId,
                DrawingImages::supports, MAX_FILE_BYTES, MAX_FILES);
        List<AiImage> images = new ArrayList<>();
        List<String> readFiles = new ArrayList<>();
        List<String> skipped = new ArrayList<>(src.skipped());
        for (DrawingContent d : src.drawings()) {
            List<AiImage> rendered = DrawingImages.render(d.filename(), d.content(), MAX_PDF_PAGES);
            if (rendered.isEmpty() || images.size() >= MAX_IMAGES) {
                skipped.add(d.filename());
                continue;
            }
            images.addAll(rendered.subList(0, Math.min(rendered.size(), MAX_IMAGES - images.size())));
            readFiles.add(d.filename());
        }
        if (images.isEmpty()) {
            throw BusinessException.conflict("estimate.no_readable_drawing");
        }

        List<CostRateSnapshot> rateSnapshot = rates.snapshot();
        AiResult result;
        try {
            result = ai.chat(new AiRequest(null, systemPrompt, userPrompt(src, rateSnapshot, skipped), model,
                    0.1, 4000).withImages(images));
        } catch (AiException e) {
            log.warn("AI estimate call failed: line={} reason={}", lineId, describe(e));
            throw new BusinessException(502, "estimate.ai_failed");
        }

        JsonNode raw;
        AiEstimate parsed;
        try {
            raw = json.readTree(extractJson(result.content()));
            parsed = json.treeToValue(raw, AiEstimate.class);
        } catch (JacksonException | IllegalArgumentException e) {
            log.warn("AI estimate output is not the expected JSON: line={} length={}", lineId,
                    result.content() == null ? 0 : result.content().length());
            throw new BusinessException(502, "estimate.ai_bad_output");
        }

        EstimateBreakdown breakdown = parsed.machined()
                ? EstimateCalculator.calculate(src.quantity(), parsed, rateSnapshot)
                : new EstimateBreakdown(EstimateCalculator.factorsFor(src.quantity()), List.of(), null, false);
        PriceEstimate saved = estimates.save(new PriceEstimate(src.orderId(), src.lineId(), src.customerOrgId(),
                parsed.machined() ? PriceEstimate.Outcome.ESTIMATED : PriceEstimate.Outcome.NOT_MACHINED,
                breakdown.unitCostCny(), breakdown.complete(),
                json.valueToTree(inputSnapshot(src, readFiles, skipped, rateSnapshot)), raw,
                json.valueToTree(breakdown), result.model() != null ? result.model() : model, opsUserId));
        return view(saved);
    }

    /** 这张单每一行最新的一次估算；没估过的行不在结果里。 */
    public List<PriceEstimateView> latest(UUID orderId) {
        Map<UUID, PriceEstimate> byLine = new LinkedHashMap<>();
        for (PriceEstimate e : estimates.findByCustomerOrderIdOrderByCreatedAtDesc(orderId)) {
            byLine.putIfAbsent(e.getCustomerOrderPartId(), e);
        }
        return byLine.values().stream().map(this::view).toList();
    }

    private PriceEstimateView view(PriceEstimate e) {
        AiEstimate a = json.treeToValue(e.getAiOutput(), AiEstimate.class);
        EstimateBreakdown b = json.treeToValue(e.getBreakdown(), EstimateBreakdown.class);
        JsonNode in = e.getInputSnapshot();
        return new PriceEstimateView(e.getId(), e.getCustomerOrderPartId(), e.getOutcome().name(),
                e.getUnitCostCny(), e.isComplete(), a.partTypeReason(), a.material(), a.netWeightKg(),
                a.blankWeightKg(), b, nullSafe(a.assumptions()), nullSafe(a.toConfirm()),
                strings(in.get("readFiles")), strings(in.get("skippedFiles")), e.getModel(), e.getCreatedAt());
    }

    /** 给模型的用户输入：订单行字段 + 三类费率名单。只有名称和单位，不给单价 —— 钱由代码算。 */
    private static String userPrompt(EstimateSource src, List<CostRateSnapshot> rates, List<String> skipped) {
        StringBuilder sb = new StringBuilder();
        sb.append("Order line\n");
        sb.append("- drawing number: ").append(orBlank(src.code())).append('\n');
        sb.append("- part name: ").append(orBlank(src.partName())).append('\n');
        sb.append("- quantity: ").append(src.quantity()).append('\n');
        sb.append("- material (customer input): ").append(orBlank(src.material())).append('\n');
        sb.append("- surface treatment (customer input): ").append(orBlank(src.surfaceTreatment())).append('\n');
        if (!skipped.isEmpty()) {
            sb.append("- files not shown to you: ").append(String.join(", ", skipped)).append('\n');
        }
        for (String kind : List.of("MATERIAL", "PROCESS", "OUTSOURCE")) {
            sb.append('\n').append(kind).append(" rates (name | unit)\n");
            rates.stream().filter(r -> r.kind().equals(kind))
                    .forEach(r -> sb.append("- ").append(r.name()).append(" | ").append(r.unit()).append('\n'));
        }
        sb.append("\nThe drawing pages follow as images.");
        return sb.toString();
    }

    private static Map<String, Object> inputSnapshot(EstimateSource src, List<String> readFiles, List<String> skipped,
                                                     List<CostRateSnapshot> rates) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", src.code());
        m.put("partName", src.partName());
        m.put("quantity", src.quantity());
        m.put("material", src.material());
        m.put("surfaceTreatment", src.surfaceTreatment());
        m.put("readFiles", readFiles);
        m.put("skippedFiles", skipped);
        m.put("rates", rates);
        return m;
    }

    /** 模型偶尔会包一层 markdown 代码块或前后带话：取第一个 '{' 到最后一个 '}'。 */
    static String extractJson(String content) {
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
            return new String(new ClassPathResource("prompts/cost-estimate.txt").getContentAsByteArray(),
                    StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * 把异常链拼成一行文字写进日志。
     *
     * <p>★ 不能把异常对象直接当最后一个参数传给 log.warn：SLF4J 会把它当堆栈处理、不填进 {@code {}}，
     * 而线上日志出口（/actuator/logtail）只存消息正文、不存堆栈 —— 原因就整个丢了（2026-11-17 线上第一次失败时就是这样）。
     * 网关的错误信息（HTTP 状态 + 错误体）不含密钥；截到 800 字防止刷屏。
     */
    static String describe(Throwable e) {
        StringBuilder sb = new StringBuilder();
        for (Throwable t = e; t != null && sb.length() < 800; t = t.getCause() == t ? null : t.getCause()) {
            if (sb.length() > 0) sb.append(" <- ");
            sb.append(t.getClass().getSimpleName());
            if (t.getMessage() != null) sb.append(": ").append(t.getMessage().replaceAll("\\s+", " "));
        }
        return sb.length() > 800 ? sb.substring(0, 800) : sb.toString();
    }

    private static List<String> strings(JsonNode node) {
        List<String> out = new ArrayList<>();
        if (node != null && node.isArray()) {
            node.forEach(n -> out.add(n.asString()));
        }
        return out;
    }

    private static <T> List<T> nullSafe(List<T> list) {
        return list == null ? List.of() : list;
    }

    private static String orBlank(String v) {
        return v == null || v.isBlank() ? "(not given)" : v;
    }
}
