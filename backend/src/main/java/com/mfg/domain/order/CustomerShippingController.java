package com.mfg.domain.order;

import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** 客户端：确认收货 + 下载随货文件（2026-11-24）。客户组织 id 一律取自 principal（§3 铁律 3）。 */
@RestController
class CustomerShippingController {

    private final ShippingService service;

    CustomerShippingController(ShippingService service) {
        this.service = service;
    }

    @PostMapping("/customer/orders/{orderId}/confirm-receipt")
    OrderView confirmReceipt(@CurrentUser UserPrincipal user, @PathVariable UUID orderId) {
        return service.confirmReceipt(user.partyId(), orderId);
    }

    @GetMapping("/customer/orders/{orderId}/documents/{documentId}/view-url")
    ViewUrl documentViewUrl(@CurrentUser UserPrincipal user, @PathVariable UUID orderId,
                            @PathVariable UUID documentId) {
        return service.customerViewUrl(user.partyId(), user.id(), orderId, documentId);
    }
}
