package com.mfg.domain.address;

import java.util.Optional;
import java.util.UUID;

/**
 * 地址域对外的唯一契约：订单域下单时从这里读收货地址（单向依赖，订单 → 地址）。
 *
 * <p>地址簿按个人账号归属，所以每个方法都显式收 {@code externalUserId}（CLAUDE.md §3 铁律 1 / 2）。
 */
public interface AddressBook {

    /** 这个用户的默认地址；地址簿为空时为空。 */
    Optional<AddressInfo> findDefault(UUID externalUserId);

    /**
     * 这个用户地址簿里的某一条。
     *
     * @throws com.mfg.common.exception.BusinessException 404 {@code address.not_found}：不存在或不是这个用户的
     */
    AddressInfo require(UUID externalUserId, UUID addressId);
}
