package com.mfg.domain.order;

import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 运营端：派单池、生产订单、拆行、派出 / 收回。{@code /ops/**} 端级闸门只放 OPERATOR 进来。 */
@RestController
class OpsDispatchController {

    private final DispatchService service;

    OpsDispatchController(DispatchService service) {
        this.service = service;
    }

    public record AllocatePart(@NotNull UUID opsOrderId, @Positive int quantity) {
    }

    /** 各份数量之和必须等于该行数量（一次拆完）。 */
    public record AllocateRequest(@NotNull UUID customerOrderPartId,
                                  @NotEmpty @Size(max = 50) List<@NotNull @Valid AllocatePart> parts) {
    }

    public record UnallocateRequest(@NotNull UUID customerOrderPartId) {
    }

    /** 对供交期：运营手填，不能早于今天。 */
    public record OfferRequest(@NotEmpty @Size(max = 50) List<@NotNull UUID> supplierOrgIds,
                               @NotNull @FutureOrPresent LocalDate supplierDueDate) {
    }

    public record PublishRequest(@NotNull @FutureOrPresent LocalDate supplierDueDate) {
    }

    @GetMapping("/ops/dispatch/pool")
    List<DispatchViews.PoolLine> pool() {
        return service.pool();
    }

    @PostMapping("/ops/dispatch/allocate")
    DispatchViews.Allocation allocate(@Valid @RequestBody AllocateRequest request) {
        return service.allocate(request.customerOrderPartId(), request.parts().stream()
                .map(p -> new DispatchService.PartInput(p.opsOrderId(), p.quantity())).toList());
    }

    /** 返回空对象：前端按 envelope 解析，data 不能缺。 */
    @PostMapping("/ops/dispatch/unallocate")
    Map<String, Object> unallocate(@Valid @RequestBody UnallocateRequest request) {
        service.unallocate(request.customerOrderPartId());
        return Map.of();
    }

    /** 新建的在前。{@code status} 不传 = 全部。 */
    @GetMapping("/ops/ops-orders")
    List<DispatchViews.OpsOrderSummary> list(@RequestParam(required = false) OpsOrder.Status status) {
        return service.list(status);
    }

    @PostMapping("/ops/ops-orders")
    DispatchViews.OpsOrderDetail create(@CurrentUser UserPrincipal user) {
        return service.create(user.id());
    }

    @GetMapping("/ops/ops-orders/{id}")
    DispatchViews.OpsOrderDetail detail(@PathVariable UUID id) {
        return service.detail(id);
    }

    @DeleteMapping("/ops/ops-orders/{id}")
    Map<String, Object> delete(@PathVariable UUID id) {
        service.delete(id);
        return Map.of();
    }

    @PostMapping("/ops/ops-orders/{id}/offer")
    DispatchViews.OpsOrderDetail offer(@PathVariable UUID id, @Valid @RequestBody OfferRequest request) {
        return service.offer(id, request.supplierOrgIds(), request.supplierDueDate());
    }

    @PostMapping("/ops/ops-orders/{id}/publish")
    DispatchViews.OpsOrderDetail publish(@PathVariable UUID id, @Valid @RequestBody PublishRequest request) {
        return service.publish(id, request.supplierDueDate());
    }

    @PostMapping("/ops/ops-orders/{id}/recall")
    DispatchViews.OpsOrderDetail recall(@PathVariable UUID id) {
        return service.recall(id);
    }

    @PostMapping("/ops/ops-orders/{id}/revoke-supplier")
    DispatchViews.OpsOrderDetail revokeSupplier(@PathVariable UUID id) {
        return service.revokeSupplier(id);
    }
}
