package com.mfg.domain.order;

import com.mfg.common.dto.PageQuery;
import com.mfg.common.dto.PagedResponse;
import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** 运营端：看客户订单。{@code /ops/**} 端级闸门只放 OPERATOR 进来。 */
@RestController
class OpsCustomerOrderController {

    private final OpsCustomerOrderService service;

    OpsCustomerOrderController(OpsCustomerOrderService service) {
        this.service = service;
    }

    /** 最近提交的排在前面。{@code status} 不传 = 全部（草稿除外）；传了非法值 → 400。 */
    @GetMapping("/ops/customer-orders")
    PagedResponse<OpsOrderSummaryView> list(@RequestParam(required = false) CustomerOrder.Status status,
                                            PageQuery page) {
        return service.list(status, page.toPageable(Sort.by(Sort.Direction.DESC, "submittedAt")));
    }

    @GetMapping("/ops/customer-orders/{orderId}")
    OpsOrderView get(@PathVariable UUID orderId) {
        return service.get(orderId);
    }

    @GetMapping("/ops/customer-orders/{orderId}/lines/{lineId}/files/{fileId}/view-url")
    ViewUrl lineFileViewUrl(@CurrentUser UserPrincipal user, @PathVariable UUID orderId, @PathVariable UUID lineId,
                            @PathVariable UUID fileId) {
        return service.lineFileViewUrl(user.id(), user.partyId(), orderId, lineId, fileId);
    }
}
