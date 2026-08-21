/**
 * 平台参数与定价算法。原型里的 T_ 和 RATES。
 *
 * ★ 这些数在内部后台「定价参数」页可改，改完立刻影响新报价。
 *   已发出的报价不受影响 —— 报价行落库时就把算出来的单价存死了，
 *   渲染历史报价绝不回头读这里（CLAUDE.md §11 C2）。
 */

import type { QuoteItem, RfqLine } from './types'

export interface PlatformParams {
    /** 产能确认期（小时）。客户接受报价后在这个窗口内确认产能。 */
    holdHours: number
    /** 抢单超时（小时）。超时无人抢则该行退回。 */
    grabHours: number
    /** 收到客户货款后 T+N 天付供应商 —— 背靠背结算。 */
    payDays: number
    /** 交付后开票期限（天） */
    invDays: number
    /** 利润率 % */
    margin: number
    /** 人工与管理（每件）。演示置 0。 */
    opsCost: number
    /** 给供应商的议价空间 % */
    spread: number
    /** EUR → CNY */
    fx: number
    /** 最小接单额，0 = 不限 */
    minOrder: number
}

export const DEFAULT_PARAMS: PlatformParams = {
    holdHours: 24,
    grabHours: 24,
    payDays: 7,
    invDays: 10,
    margin: 25,
    opsCost: 0,
    spread: 8,
    fx: 7.8,
    minOrder: 0,
}

export interface Rate {
    mat: string
    /** 基准制造成本 ¥/件 */
    rate: number
}

export const DEFAULT_RATES: Rate[] = [
    { mat: '材料 A', rate: 100 },
    { mat: '材料 B', rate: 100 },
    { mat: '材料 C', rate: 100 },
    { mat: '材料 D', rate: 100 },
]

export const SURFACES = ['无', '表面处理 A', '表面处理 B', '表面处理 C']

export const materials = (rates: Rate[]) => rates.map((r) => r.mat)

const rateOf = (rates: Rate[], mat: string) =>
    (rates.find((r) => r.mat === mat) || { rate: 100 }).rate

/** 基准制造成本（¥/件） */
export const baseCost = (rates: Rate[], item: RfqLine) => rateOf(rates, item.mat)

/** 对客单价（€/件）= 基准成本 × (1 + 利润率) ÷ 汇率 */
export const custUnit = (rates: Rate[], p: PlatformParams, item: RfqLine) =>
    +((baseCost(rates, item) * (1 + p.margin / 100)) / p.fx).toFixed(2)

/** 供应商目标价（¥/件）= 基准成本 × (1 + 议价空间) */
export const supTarget = (rates: Rate[], p: PlatformParams, item: RfqLine) =>
    +(baseCost(rates, item) * (1 + p.spread / 100)).toFixed(2)

/** 报价行的供应商目标价合计，内部后台算毛利率用 */
export const targetTotal = (rates: Rate[], p: PlatformParams, items: QuoteItem[]) =>
    items.reduce((s, i) => s + supTarget(rates, p, i) * num(i.qty), 0)

/** 宽松取数：输入框里的值可能带单位或为空，取不出数就当 0。 */
export const num = (v: unknown): number => {
    const n = parseFloat(String(v).replace(/[^\d.-]/g, ''))
    return isFinite(n) ? n : 0
}
