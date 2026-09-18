package com.mfg.domain.quote;

import com.mfg.common.exception.BusinessException;
import com.mfg.common.security.CurrentUser;
import com.mfg.common.security.UserPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * 对供价：运营端看每家的价（{@code /ops/**}），供应商端看自己的价（{@code /supplier/**}，组织 id 取自 principal）。
 */
@RestController
class SupplierPriceController {

    private static final int MAX_IDS = 200;

    private final SupplierPricingService service;

    SupplierPriceController(SupplierPricingService service) {
        this.service = service;
    }

    @GetMapping("/ops/ops-orders/{id}/supplier-prices")
    List<SupplierPriceViews.OpsSupplierPrice> opsPrices(@PathVariable UUID id) {
        return service.opsPrices(id);
    }

    /** {@code opsOrderIds} 逗号分隔，最多 200 个。 */
    @GetMapping("/supplier/offer-prices")
    List<SupplierPriceViews.OfferPrice> offerPrices(@CurrentUser UserPrincipal user,
                                                   @RequestParam List<UUID> opsOrderIds) {
        if (opsOrderIds.size() > MAX_IDS) {
            throw BusinessException.badRequest("common.bad_request");
        }
        return service.offerPrices(user.partyId(), opsOrderIds);
    }

    @GetMapping("/supplier/order-prices")
    List<SupplierPriceViews.OrderPrice> orderPrices(@CurrentUser UserPrincipal user) {
        return service.orderPrices(user.partyId());
    }
}
