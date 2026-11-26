/**
 * 收货地址的文字格式（2026-11-26 地址簿）。设置页列表、下单选地址、运营只读弹框、「复制」共用。
 *
 * ★ 原样输出用户填的文字，不翻译（需求方定）。只有国家存的是代码，显示成当前界面语言的名字 ——
 *   和卡片上看到的一样。
 */

import type { Lang } from '../i18n/lang'
import { countryName } from '../i18n/countries'

export interface AddressLike {
    country: string
    company: string
    contact: string
    phone: string
    line1: string
    line2?: string | null
    city: string
    region?: string | null
    postalCode?: string | null
}

/** 「邮编 城市 州/省」，和订单上的收货地址卡片一样 */
export function cityLine(a: AddressLike): string {
    return [a.postalCode, a.city, a.region].filter(Boolean).join(' ')
}

/** 列表里的一行：地址 · 城市行 · 国家 */
export function addressOneLine(a: AddressLike, lang: Lang): string {
    return [[a.line1, a.line2].filter(Boolean).join(', '), cityLine(a), countryName(a.country, lang)].join(' · ')
}

/** 「复制」出来的多行文本（需求方 2026-11-26 认可的示例格式） */
export function addressCopyText(a: AddressLike, lang: Lang): string {
    return [
        a.company,
        `${a.contact}  ${a.phone}`,
        a.line1,
        a.line2,
        cityLine(a),
        countryName(a.country, lang),
    ].filter(Boolean).join('\n')
}
