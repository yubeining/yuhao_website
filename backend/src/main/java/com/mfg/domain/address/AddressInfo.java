package com.mfg.domain.address;

/**
 * 一条收货地址的全部字段 —— 地址域对外发布的数据形状，不是实体。
 *
 * <p>订单域拿到它后复制进订单（快照，CLAUDE.md §10 C2），之后地址簿怎么改都不影响已有订单。
 * {@code country} 是 ISO 3166-1 两位代码；{@code line2 / region / postalCode} 选填，没填为 null。
 */
public record AddressInfo(String country, String company, String contact, String phone, String line1, String line2,
                          String city, String region, String postalCode) {
}
