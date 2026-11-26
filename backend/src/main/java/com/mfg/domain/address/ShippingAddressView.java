package com.mfg.domain.address;

import java.util.UUID;

/**
 * 地址簿对外响应 —— 白名单字段（CLAUDE.md §3 铁律 5）。不输出所有者 id。
 * 选填项没填时为 null（接口不输出 null 字段）。
 */
public record ShippingAddressView(UUID id, String country, String company, String contact, String phone,
                                  String line1, String line2, String city, String region, String postalCode,
                                  boolean isDefault) {

    static ShippingAddressView of(ShippingAddress a) {
        AddressInfo i = a.toInfo();
        return new ShippingAddressView(a.getId(), i.country(), i.company(), i.contact(), i.phone(), i.line1(),
                i.line2(), i.city(), i.region(), i.postalCode(), a.isDefault());
    }
}
