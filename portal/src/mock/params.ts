/**
 * 平台参数与定价算法。
 *
 * ★ 这些数在内部后台「定价参数」页可改，改完立刻影响新报价。
 *   已发出的报价不受影响 —— 报价行落库时就把算出来的单价存死了，
 *   渲染历史报价绝不回头读这里（CLAUDE.md §10 C2）。
 *
 * ★★ 默认值的规矩：**有出处的才有默认值，没出处的一律 null。**
 *   null 的系数会挡住估价（见 pricingBlockers）—— 宁可估不出来，
 *   也不用一个编出来的数字算价（CLAUDE.md §10 C5）。
 *
 * ★★★ 2026-09-18 需求方决定：原型页保留，假数据删除。
 *   2026-08-25 应要求写死的演示种子（利润率 25、议价 10、汇率 7.8、付款 T+30、六个材料成本）已清掉；
 *   抢单超时 24 小时、报价有效期 15 天原本只是默认值假设，也清掉 ——
 *   有效期已定为不设（文档 13 §2.07），抢单超时天数还没给。全部显示「未设置」。
 */

import type { OrderPart } from './types'

export interface PlatformParams {
    /** 抢单超时（小时）。超时无人抢则调价重挂或退回。数值没定。 */
    grabHours: number | null
    /** 报价有效期（天）。已定为不设（文档 13 §2.07），原型保留这一项只为页面结构。 */
    validDays: number | null
    /** 利润率 %。概念见文档 8（可配），数值没人定过 —— 运营设了才有。 */
    margin: number | null
    /** 给供应商的议价空间 %。同上，概念有出处、数值没有。 */
    spread: number | null
    /** EUR → CNY。真实来源应是汇率快照服务（文档 2 fx/），原型里只能由运营手填。 */
    fx: number | null
    /** 背靠背结算：客户回款后 T+N 天付供应商。背靠背是会议拍板的，N 没人定过。 */
    payDays: number | null
}

/** 全部未设置（2026-09-18 删除演示种子，见文件头）。 */
export const DEFAULT_PARAMS: PlatformParams = {
    grabHours: null,
    validDays: null,
    margin: null,
    spread: null,
    fx: null,
    payDays: null,
}

export interface Rate {
    mat: string
    /** 基准制造成本 ¥/件 */
    rate: number
}

/**
 * 材料与基准成本。没有材料主数据表、也没有真实成本单，所以为空（2026-09-18 删除演示种子）。
 */
export const DEFAULT_RATES: Rate[] = []

/**
 * 表面处理。
 *
 * ★ 同样不预置。原来的「表面处理 A / B / C」也是编的。
 *   空数组意味着这个字段暂时只能留空 —— 留空是诚实的，
 *   给一组假选项会让人选一个然后照着算。
 */
export const SURFACES: string[] = []

export const materials = (rates: Rate[]) => rates.map((r) => r.mat)

/**
 * 查材料基准成本。查不到就是查不到 ——
 * 这里曾经写过 `|| { rate: 100 }`：材料没配价就按 ¥100 算，
 * 于是任何随手填的材料都能"估"出一个价。那是整个原型里最重的一处编造。
 *
 * ★ 这张表现在的角色是 **AI 估价的锚点**（mock/ai.ts），不再被定价公式直接读。
 *   零件的基准成本一律取 part.base —— 那个值要么是 AI 估的，要么是运营填的，
 *   两者都留了来源。查表直接算价等于绕开了「这个价是谁定的」这个问题。
 */
export const rateOf = (rates: Rate[], mat: string) => rates.find((r) => r.mat === mat)?.rate

/**
 * 这一单现在能不能出报价。返回缺的东西，空数组 = 能出。
 * finishPricing 用它做闸门，内部后台用它解释单子为什么停在待估价。
 *
 * ★ 零件缺基准成本是最常见的一项：AI 说没把握、运营还没定价，都会落到这里。
 */
export const pricingBlockers = (p: PlatformParams, parts: OrderPart[]): string[] => {
    const out: string[] = []
    if (p.margin == null) out.push('利润率未设置')
    if (p.spread == null) out.push('议价空间未设置')
    if (p.fx == null) out.push('汇率未设置')
    parts.forEach((pt) => {
        if (pt.base == null) out.push(`零件「${pt.no || pt.name || '未命名'}」还没有基准成本`)
    })
    return [...new Set(out)]
}

/** 对客单价（€/件）= 基准成本 × (1 + 利润率) ÷ 汇率。缺任何一项返回 null。 */
export const custUnit = (p: PlatformParams, base: number | undefined): number | null => {
    if (base == null || p.margin == null || p.fx == null) return null
    return +((base * (1 + p.margin / 100)) / p.fx).toFixed(2)
}

/** 供应商目标价（¥/件）= 基准成本 × (1 + 议价空间)。缺任何一项返回 null。 */
export const supTarget = (p: PlatformParams, base: number | undefined): number | null => {
    if (base == null || p.spread == null) return null
    return +(base * (1 + p.spread / 100)).toFixed(2)
}

/** 宽松取数：输入框里的值可能带单位或为空，取不出数就当 0。 */
export const num = (v: unknown): number => {
    const n = parseFloat(String(v).replace(/[^\d.-]/g, ''))
    return isFinite(n) ? n : 0
}
