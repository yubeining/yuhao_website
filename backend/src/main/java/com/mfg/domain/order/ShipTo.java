package com.mfg.domain.order;

/**
 * 订单的收货地址 —— 白名单字段（CLAUDE.md §3 铁律 5）。只出现在客户端和运营端的订单详情里。
 *
 * <p>★ 不进供应商侧的任何视图：设计文档 1 §3.2「不暴露客户联系方式和收货地址」。
 *
 * <p>{@code country} 是 ISO 3166-1 两位代码，显示名由前端按语种翻。选填的 {@code line2 / region / postalCode}
 * 没填时为 null（接口不输出 null 字段）。
 */
public record ShipTo(String country, String company, String contact, String phone, String line1, String line2,
                     String city, String region, String postalCode) {
}
