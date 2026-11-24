package com.mfg.domain.order;

import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 供应商端报工：开工 / 完工 / 发给平台（2026-09-20 拍板，只报这两个动作，不报件数）。
 * {@code /supplier/**} 端级闸门只放 SUPPLIER；供应商组织 id 一律取自 principal（§3 铁律 3）。
 */
@RestController
class SupplierProductionController {

    private final ProductionService service;

    SupplierProductionController(ProductionService service) {
        this.service = service;
    }

    @PostMapping("/supplier/orders/{id}/lines/{lineId}/start")
    DispatchViews.SupplierOrderView start(@CurrentUser UserPrincipal user, @PathVariable UUID id,
                                          @PathVariable UUID lineId) {
        return service.start(user.partyId(), id, lineId);
    }

    @PostMapping("/supplier/orders/{id}/lines/{lineId}/produced")
    DispatchViews.SupplierOrderView produced(@CurrentUser UserPrincipal user, @PathVariable UUID id,
                                             @PathVariable UUID lineId) {
        return service.produced(user.partyId(), id, lineId);
    }

    /** 承运商（自由文本）+ 运单号，都必填（2026-11-24 拍板）。 */
    public record ShipRequest(@NotBlank @Size(max = 100) String carrier, @NotBlank @Size(max = 100) String trackingNo) {
    }

    /** 整单全部完工才能发；返工 / 重做的行做完之后再点一次，发的就是那几行。 */
    @PostMapping("/supplier/orders/{id}/ship")
    DispatchViews.SupplierOrderView ship(@CurrentUser UserPrincipal user, @PathVariable UUID id,
                                         @Valid @RequestBody ShipRequest request) {
        return service.ship(user.partyId(), user.id(), id, request.carrier(), request.trackingNo());
    }
}
