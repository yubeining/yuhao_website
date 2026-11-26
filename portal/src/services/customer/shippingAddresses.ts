/** 客户端：我的收货地址簿（2026-11-26，后端 CustomerShippingAddressController）。按个人账号归属。 */

import { http } from '../core/http'

/** 一条地址簿里的地址。country 是 ISO 3166-1 两位代码；line2 / region / postalCode 选填，没填就没有这个字段。 */
export interface ShippingAddressView {
    id: string
    country: string
    company: string
    contact: string
    phone: string
    line1: string
    line2?: string | null
    city: string
    region?: string | null
    postalCode?: string | null
    isDefault: boolean
}

export interface ShippingAddressInput {
    country: string
    company: string
    contact: string
    phone: string
    line1: string
    line2: string | null
    city: string
    region: string | null
    postalCode: string | null
    makeDefault: boolean
}

/** 智能粘贴拆出来的草稿：拆不出来的字段没有。只用来预填表单，不落库。 */
export type ParsedAddress = Partial<Omit<ShippingAddressView, 'id' | 'isDefault'>>

/** 默认地址排第一，其余按添加顺序（后端排好）。 */
export function listShippingAddresses(): Promise<ShippingAddressView[]> {
    return http.get<ShippingAddressView[]>('/customer/shipping-addresses')
}

/** 第一条自动成为默认；每人最多 20 条，满了 409 address.limit_reached。 */
export function createShippingAddress(input: ShippingAddressInput): Promise<ShippingAddressView> {
    return http.post<ShippingAddressView>('/customer/shipping-addresses', input)
}

/** 整体替换。makeDefault=false 不会取消默认（默认地址只能靠把别的设为默认来换）。 */
export function updateShippingAddress(id: string, input: ShippingAddressInput): Promise<ShippingAddressView> {
    return http.put<ShippingAddressView>(`/customer/shipping-addresses/${id}`, input)
}

/** 删掉默认地址后，剩下最早加的那条自动成为默认。 */
export function deleteShippingAddress(id: string): Promise<void> {
    return http.delete<void>(`/customer/shipping-addresses/${id}`)
}

export function setDefaultShippingAddress(id: string): Promise<ShippingAddressView> {
    return http.post<ShippingAddressView>(`/customer/shipping-addresses/${id}/default`)
}

/** 智能粘贴：后端调 AI 拆字段。失败 502 address.parse_failed，太频繁 429 common.rate_limited。 */
export function parseShippingAddress(text: string): Promise<ParsedAddress> {
    return http.post<ParsedAddress>('/customer/shipping-addresses/parse', { text })
}
