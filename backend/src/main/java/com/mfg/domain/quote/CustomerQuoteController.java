package com.mfg.domain.quote;

import com.mfg.common.dto.PageQuery;
import com.mfg.common.dto.PagedResponse;
import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.UUID;

/**
 * 客户端：看报价、确认、拒绝。{@code /customer/**} 端级闸门只放 CUSTOMER 进来；租户 id 一律取自 principal。
 */
@RestController
class CustomerQuoteController {

    private final QuoteService service;

    CustomerQuoteController(QuoteService service) {
        this.service = service;
    }

    /** {@code rateDate}：客户看到的价格所用的汇率日期，和服务端最新的不一致就拒绝确认。 */
    public record ConfirmRequest(@NotNull UUID quoteId, @NotNull LocalDate rateDate) {
    }

    public record RejectRequest(@NotNull UUID quoteId) {
    }

    /** 最近发出的在前。 */
    @GetMapping("/customer/quotes")
    PagedResponse<CustomerQuoteSummaryView> list(@CurrentUser UserPrincipal user, PageQuery page) {
        return service.listForCustomer(user.partyId(), page.toPageable(Sort.by(Sort.Direction.DESC, "sentAt")));
    }

    @GetMapping("/customer/orders/{orderId}/quote")
    CustomerQuoteView current(@CurrentUser UserPrincipal user, @PathVariable UUID orderId) {
        return service.current(user.partyId(), orderId);
    }

    @PostMapping("/customer/orders/{orderId}/quote/confirm")
    CustomerQuoteView confirm(@CurrentUser UserPrincipal user, @PathVariable UUID orderId,
                              @Valid @RequestBody ConfirmRequest request) {
        return service.confirm(user.partyId(), user.id(), orderId, request.quoteId(), request.rateDate());
    }

    @PostMapping("/customer/orders/{orderId}/quote/reject")
    CustomerQuoteView reject(@CurrentUser UserPrincipal user, @PathVariable UUID orderId,
                             @Valid @RequestBody RejectRequest request) {
        return service.reject(user.partyId(), user.id(), orderId, request.quoteId());
    }
}
