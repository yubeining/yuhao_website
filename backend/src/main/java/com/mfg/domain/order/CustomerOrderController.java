package com.mfg.domain.order;

import com.mfg.common.dto.PageQuery;
import com.mfg.common.dto.PagedResponse;
import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.UUID;

/**
 * 客户端：订单。全部在 {@code /customer/**} 下，端级闸门按路径前缀只放 CUSTOMER 进来。
 * 租户 id 一律取自 principal，不从路径或请求体收（§3 铁律 3）。
 */
@RestController
class CustomerOrderController {

    private final CustomerOrderService service;

    CustomerOrderController(CustomerOrderService service) {
        this.service = service;
    }

    public record OrderDraftRequest(@Size(max = 200) String title, LocalDate wantedDate) {
    }

    public record AddLineRequest(@NotBlank @Size(max = 200) String code,
                                 @NotBlank @Size(max = 200) String name,
                                 @Positive int quantity,
                                 @Size(max = 200) String material,
                                 @Size(max = 200) String surfaceTreatment,
                                 @Size(max = 50) String customerRev) {
    }

    public record UpdateLineRequest(@NotBlank @Size(max = 200) String name,
                                    @Positive int quantity,
                                    @Size(max = 200) String material,
                                    @Size(max = 200) String surfaceTreatment) {
    }

    public record NewRevisionRequest(@Size(max = 50) String customerRev) {
    }

    @PostMapping("/customer/orders")
    OrderView create(@CurrentUser UserPrincipal user, @Valid @RequestBody OrderDraftRequest request) {
        return service.create(user.partyId(), user.id(), request.title(), request.wantedDate());
    }

    /** 新建的排在前面。排序由后端定，不从请求收。 */
    @GetMapping("/customer/orders")
    PagedResponse<OrderSummaryView> list(@CurrentUser UserPrincipal user, PageQuery page) {
        return service.list(user.partyId(), page.toPageable(Sort.by(Sort.Direction.DESC, "createdAt")));
    }

    @GetMapping("/customer/orders/{orderId}")
    OrderView get(@CurrentUser UserPrincipal user, @PathVariable UUID orderId) {
        return service.get(user.partyId(), orderId);
    }

    /** ★ 整体替换，不是局部更新：请求里没带的字段（名称 / 期望交期）会被清空。前端每次都两个一起传。 */
    @PatchMapping("/customer/orders/{orderId}")
    OrderView update(@CurrentUser UserPrincipal user, @PathVariable UUID orderId,
                     @Valid @RequestBody OrderDraftRequest request) {
        return service.updateDraft(user.partyId(), orderId, request.title(), request.wantedDate());
    }

    @PostMapping("/customer/orders/{orderId}/submit")
    OrderView submit(@CurrentUser UserPrincipal user, @PathVariable UUID orderId) {
        return service.submit(user.partyId(), orderId);
    }

    @PostMapping("/customer/orders/{orderId}/cancel")
    OrderView cancel(@CurrentUser UserPrincipal user, @PathVariable UUID orderId) {
        return service.cancel(user.partyId(), orderId);
    }

    @PostMapping("/customer/orders/{orderId}/lines")
    OrderLineView addLine(@CurrentUser UserPrincipal user, @PathVariable UUID orderId,
                          @Valid @RequestBody AddLineRequest request) {
        return service.addLine(user.partyId(), user.id(), orderId, request.code(), request.name(), request.quantity(),
                request.material(), request.surfaceTreatment(), request.customerRev());
    }

    /** ★ 整体替换：没带的材料 / 表面处理会被清空。 */
    @PatchMapping("/customer/orders/{orderId}/lines/{lineId}")
    OrderLineView updateLine(@CurrentUser UserPrincipal user, @PathVariable UUID orderId, @PathVariable UUID lineId,
                             @Valid @RequestBody UpdateLineRequest request) {
        return service.updateLine(user.partyId(), orderId, lineId, request.name(), request.quantity(),
                request.material(), request.surfaceTreatment());
    }

    /** 返回删除后的订单 —— 空响应体会让前端按 envelope 解析失败。 */
    @DeleteMapping("/customer/orders/{orderId}/lines/{lineId}")
    OrderView removeLine(@CurrentUser UserPrincipal user, @PathVariable UUID orderId, @PathVariable UUID lineId) {
        return service.removeLine(user.partyId(), orderId, lineId);
    }

    @PostMapping("/customer/orders/{orderId}/lines/{lineId}/new-revision")
    OrderLineView startNewRevision(@CurrentUser UserPrincipal user, @PathVariable UUID orderId,
                                   @PathVariable UUID lineId, @Valid @RequestBody NewRevisionRequest request) {
        return service.startNewRevision(user.partyId(), user.id(), orderId, lineId, request.customerRev());
    }

    @GetMapping("/customer/orders/{orderId}/lines/{lineId}/files/{fileId}/view-url")
    ViewUrl lineFileViewUrl(@CurrentUser UserPrincipal user, @PathVariable UUID orderId, @PathVariable UUID lineId,
                            @PathVariable UUID fileId) {
        return service.lineFileViewUrl(user.partyId(), user.id(), user.partyType(), orderId, lineId, fileId);
    }
}
