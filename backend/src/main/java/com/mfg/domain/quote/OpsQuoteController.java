package com.mfg.domain.quote;

import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** 运营端：客户加成率、报价。{@code /ops/**} 端级闸门只放 OPERATOR 进来。 */
@RestController
class OpsQuoteController {

    private final QuoteService service;

    OpsQuoteController(QuoteService service) {
        this.service = service;
    }

    /** 加成率：大于 0，最多 4 位小数（列是 numeric(8,4)）。1.2 = 加价 20%。 */
    public record MarkupRequest(@NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 4, fraction = 4)
                                BigDecimal markupRate) {
    }

    /** 一行原价：CNY / 件，大于 0，最多 2 位小数。 */
    public record QuoteLineRequest(@NotNull UUID lineId,
                                   @NotNull @DecimalMin(value = "0", inclusive = false)
                                   @Digits(integer = 10, fraction = 2) BigDecimal unitPriceCny) {
    }

    /** {@code leadDays}：交期，客户确认后多少天。{@code lines} 必须和订单行一一对应。 */
    public record SendQuoteRequest(@NotNull @Pattern(regexp = "EUR|USD|GBP|CNY") String currency,
                                   @NotNull @Positive Integer leadDays,
                                   @NotEmpty List<@NotNull @Valid QuoteLineRequest> lines) {

        List<QuoteService.LineInput> inputs() {
            return lines.stream().map(l -> new QuoteService.LineInput(l.lineId(), l.unitPriceCny())).toList();
        }

        Quote.Currency quoteCurrency() {
            return Quote.Currency.valueOf(currency);
        }
    }

    @GetMapping("/ops/customers/{orgId}/markup")
    MarkupView getMarkup(@PathVariable UUID orgId) {
        return service.getMarkup(orgId);
    }

    @PutMapping("/ops/customers/{orgId}/markup")
    MarkupView setMarkup(@PathVariable UUID orgId, @Valid @RequestBody MarkupRequest request) {
        return service.setMarkup(orgId, request.markupRate());
    }

    @PostMapping("/ops/customer-orders/{orderId}/quotes")
    OpsQuoteView send(@CurrentUser UserPrincipal user, @PathVariable UUID orderId,
                      @Valid @RequestBody SendQuoteRequest request) {
        return service.send(user.id(), orderId, request.quoteCurrency(), request.leadDays(), request.inputs());
    }

    @PostMapping("/ops/customer-orders/{orderId}/quotes/preview")
    QuotePreviewView preview(@PathVariable UUID orderId, @Valid @RequestBody SendQuoteRequest request) {
        return service.preview(orderId, request.quoteCurrency(), request.inputs());
    }

    /** 这些订单各自最新一版报价的状态。{@code orderIds} 逗号分隔，最多 200 个；没报过价的不在结果里。 */
    @GetMapping("/ops/quote-summaries")
    List<OpsQuoteSummaryView> summaries(@RequestParam List<UUID> orderIds) {
        return service.summaries(orderIds);
    }

    /** 全部版本，新的在前。 */
    @GetMapping("/ops/customer-orders/{orderId}/quotes")
    List<OpsQuoteView> list(@PathVariable UUID orderId) {
        return service.listForOps(orderId);
    }
}
