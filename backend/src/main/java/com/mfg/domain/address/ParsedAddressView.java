package com.mfg.domain.address;

/**
 * 智能粘贴拆出来的地址草稿 —— 只用来预填新增弹框，不落库。拆不出来的字段为 null（接口不输出）。
 * 白名单字段（CLAUDE.md §3 铁律 5）。
 */
public record ParsedAddressView(String country, String company, String contact, String phone, String line1,
                                String line2, String city, String region, String postalCode) {
}
