package com.mfg.domain.order;

import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * 供应商端：派给我的 / 市场上的单、接单、拒接、我的订单、退单、看图。{@code /supplier/**} 端级闸门只放 SUPPLIER；
 * 供应商组织 id 一律取自 principal（§3 铁律 3）。
 */
@RestController
class SupplierOfferController {

    private final SupplierOfferService service;

    SupplierOfferController(SupplierOfferService service) {
        this.service = service;
    }

    /** 最近派出的在前。 */
    @GetMapping("/supplier/offers")
    List<DispatchViews.SupplierOfferSummary> offers(@CurrentUser UserPrincipal user) {
        return service.offers(user.partyId());
    }

    @GetMapping("/supplier/offers/{id}")
    DispatchViews.SupplierOffer offer(@CurrentUser UserPrincipal user, @PathVariable UUID id) {
        return service.offer(user.partyId(), id);
    }

    @PostMapping("/supplier/offers/{id}/accept")
    DispatchViews.SupplierOrderView accept(@CurrentUser UserPrincipal user, @PathVariable UUID id) {
        return service.accept(user.partyId(), user.id(), id);
    }

    @PostMapping("/supplier/offers/{id}/decline")
    DispatchViews.Declined decline(@CurrentUser UserPrincipal user, @PathVariable UUID id) {
        return service.decline(user.partyId(), id);
    }

    @GetMapping("/supplier/offers/{id}/lines/{lineId}/files/{fileId}/view-url")
    ViewUrl offerFile(@CurrentUser UserPrincipal user, @PathVariable UUID id, @PathVariable UUID lineId,
                      @PathVariable UUID fileId) {
        return service.offerFileViewUrl(user.partyId(), user.id(), id, lineId, fileId);
    }

    /** 最近接的在前，含已取消的。 */
    @GetMapping("/supplier/orders")
    List<DispatchViews.SupplierOrderView> orders(@CurrentUser UserPrincipal user) {
        return service.orders(user.partyId());
    }

    @GetMapping("/supplier/orders/{id}")
    DispatchViews.SupplierOrderView order(@CurrentUser UserPrincipal user, @PathVariable UUID id) {
        return service.order(user.partyId(), id);
    }

    /** 签字 = 锁定，签完退不了也改不了。 */
    @PostMapping("/supplier/orders/{id}/sign")
    DispatchViews.SupplierOrderView sign(@CurrentUser UserPrincipal user, @PathVariable UUID id) {
        return service.sign(user.partyId(), user.id(), id);
    }

    @PostMapping("/supplier/orders/{id}/withdraw")
    DispatchViews.SupplierOrderView withdraw(@CurrentUser UserPrincipal user, @PathVariable UUID id) {
        return service.withdraw(user.partyId(), id);
    }

    @GetMapping("/supplier/orders/{id}/lines/{lineId}/files/{fileId}/view-url")
    ViewUrl orderFile(@CurrentUser UserPrincipal user, @PathVariable UUID id, @PathVariable UUID lineId,
                      @PathVariable UUID fileId) {
        return service.orderFileViewUrl(user.partyId(), user.id(), id, lineId, fileId);
    }
}
