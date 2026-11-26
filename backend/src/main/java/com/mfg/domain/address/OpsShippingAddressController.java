package com.mfg.domain.address;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * 运营端：看某个客户用户的收货地址簿，只读（2026-11-26 需求方定：运营可以看）。
 * 运营跨客户是这个受众本来的范围；用户不存在或没有地址时返回空列表。
 */
@RestController
class OpsShippingAddressController {

    private final ShippingAddressService service;

    OpsShippingAddressController(ShippingAddressService service) {
        this.service = service;
    }

    @GetMapping("/ops/users/{userId}/shipping-addresses")
    List<ShippingAddressView> list(@PathVariable UUID userId) {
        return service.list(userId);
    }
}
