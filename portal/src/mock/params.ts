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
 */

import type { OrderPart } from './types'

export interface PlatformParams {
    /** 抢单超时（小时）。超时无人抢则调价重挂或退回。默认 24 —— 文档 6 Q9（参考仅一），可配置。 */
    grabHours: number
    /** 报价有效期（天）。默认 15 —— 文档 5 Q6，可配置。 */
    validDays: number
    /** 利润率 %。概念见文档 8（可配），数值没人定过 —— 运营设了才有。 */
    margin: number | null
    /** 给供应商的议价空间 %。同上，概念有出处、数值没有。 */
    spread: number | null
    /** EUR → CNY。真实来源应是汇率快照服务（文档 2 fx/），原型里只能由运营手填。 */
    fx: number | null
    /** 背靠背结算：客户回款后 T+N 天付供应商。背靠背是会议拍板的，N 没人定过。 */
    payDays: number | null
}

export const DEFAULT_PARAMS: PlatformParams = {
    grabHours: 24,
    validDays: 15,
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
 * 材料与基准成本。
 *
 * ★★ **初始为空，不预置任何材料。**
 *
 *   曾经这里写死过「材料 A / B / C / D」，是从原型搬来的占位。
 *   摆到真界面上就是一组编造的选项：库里没有材料主数据表
 *   （只有 spec_template 和 pricing_rule，都不是材料清单），
 *   所以那四个既没有来源，也没有任何地方能维护它们。
 *
 *   更要命的是定价公式就是按材料算的 —— 选项是假的，算出来的价也是假的。
 *
 *   现在由运营在「定价参数」页自己加。加之前一条都没有，界面明说没有。
 *   真正的解法是后端建材料主数据表，那要等后端开工。
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
 * 查基准成本。查不到就是查不到 ——
 * 这里曾经写过 `|| { rate: 100 }`：材料没配价就按 ¥100 算，
 * 于是任何随手填的材料都能"估"出一个价。那是整个原型里最重的一处编造。
 */
const rateOf = (rates: Rate[], mat: string) => rates.find((r) => r.mat === mat)?.rate

/**
 * 这一单现在能不能估价。返回缺的东西，空数组 = 能估。
 * finishPricing 用它做闸门，内部后台用它解释单子为什么停在待估价。
 */
export const pricingBlockers = (rates: Rate[], p: PlatformParams, parts: OrderPart[]): string[] => {
    const out: string[] = []
    if (p.margin == null) out.push('利润率未设置')
    if (p.spread == null) out.push('议价空间未设置')
    if (p.fx == null) out.push('汇率未设置')
    parts.forEach((pt) => {
        if (rateOf(rates, pt.mat) === undefined) out.push(`材料「${pt.mat || '（空）'}」没有基准成本`)
    })
    return [...new Set(out)]
}

/** 对客单价（€/件）= 基准成本 × (1 + 利润率) ÷ 汇率。缺任何一项返回 null。 */
export const custUnit = (rates: Rate[], p: PlatformParams, item: OrderPart): number | null => {
    const rate = rateOf(rates, item.mat)
    if (rate === undefined || p.margin == null || p.fx == null) return null
    return +((rate * (1 + p.margin / 100)) / p.fx).toFixed(2)
}

/** 供应商目标价（¥/件）= 基准成本 × (1 + 议价空间)。缺任何一项返回 null。 */
export const supTarget = (rates: Rate[], p: PlatformParams, item: OrderPart): number | null => {
    const rate = rateOf(rates, item.mat)
    if (rate === undefined || p.spread == null) return null
    return +(rate * (1 + p.spread / 100)).toFixed(2)
}

/** 宽松取数：输入框里的值可能带单位或为空，取不出数就当 0。 */
export const num = (v: unknown): number => {
    const n = parseFloat(String(v).replace(/[^\d.-]/g, ''))
    return isFinite(n) ? n : 0
}
