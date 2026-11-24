package com.mfg.domain.order;

import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** 运营端：发给客户 + 随货文件（2026-11-24）。{@code /ops/**} 端级闸门只放 OPERATOR。 */
@RestController
class OpsShippingController {

    private final ShippingService service;

    OpsShippingController(ShippingService service) {
        this.service = service;
    }

    /** 承运商（自由文本）+ 运单号，都必填。 */
    public record ShipRequest(@NotBlank @Size(max = 100) String carrier, @NotBlank @Size(max = 100) String trackingNo) {
    }

    public record DocumentUploadRequest(@NotBlank @Size(max = 255) String filename, @Size(max = 200) String contentType) {
    }

    @PostMapping("/ops/customer-orders/{orderId}/ship")
    OpsOrderView ship(@CurrentUser UserPrincipal user, @PathVariable UUID orderId,
                      @Valid @RequestBody ShipRequest request) {
        return service.ship(orderId, user.id(), request.carrier(), request.trackingNo());
    }

    @PostMapping("/ops/customer-orders/{orderId}/documents")
    UploadTicket requestDocumentUpload(@CurrentUser UserPrincipal user, @PathVariable UUID orderId,
                                       @Valid @RequestBody DocumentUploadRequest request) {
        return service.requestUpload(orderId, user.id(), request.filename(), request.contentType());
    }

    @PostMapping("/ops/customer-orders/{orderId}/documents/{documentId}/complete")
    OrderDocumentView completeDocument(@PathVariable UUID orderId, @PathVariable UUID documentId) {
        return service.complete(orderId, documentId);
    }

    @GetMapping("/ops/customer-orders/{orderId}/documents/{documentId}/view-url")
    ViewUrl documentViewUrl(@CurrentUser UserPrincipal user, @PathVariable UUID orderId,
                            @PathVariable UUID documentId) {
        return service.opsViewUrl(user.id(), user.partyId(), orderId, documentId);
    }
}
