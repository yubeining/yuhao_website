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
 * ★★★ 例外（2026-08-25）：DEFAULT_PARAMS 的四个系数和 DEFAULT_RATES 现在
 *   带着一份**演示种子**，是应要求写死的，为的是让整条流程能跑通。
 *   两处都标了出处为空。**接后端或对外报价之前必须清掉**，办法见各自注释。
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

/**
 * ★★★ 演示种子（2026-08-25 按明确要求写死）。
 *
 * 下面这四个数**没有业务依据** —— 文档 5 Q7、文档 7 Q16 都还写着「待你给具体数字」。
 * 写死它们只为一件事：让「建单 → 提交 → 估价 → 出报价 → 确认 → 发布 → 抢单」
 * 这条链在没人配过参数的情况下也能整条跑通，供演示和自测。
 *
 * **它们不是定价口径，任何对外报价都不能引用这里算出来的数。**
 *
 * 恢复原状的办法：把这四个值改回 null、DEFAULT_RATES 改回 []。
 * 改回去之后 pricingBlockers 会重新挡住估价，也就是「没配就估不出来」。
 */
export const DEFAULT_PARAMS: PlatformParams = {
    grabHours: 24,
    validDays: 15,
    // ↓ 演示种子，无出处，见上
    margin: 25,
    spread: 10,
    fx: 7.8,
    payDays: 30,
}

export interface Rate {
    mat: string
    /** 基准制造成本 ¥/件 */
    rate: number
}

/**
 * 材料与基准成本。
 *
 * ★★★ 演示种子。**下面六个牌号和六个成本都是编的。**
 *
 *   牌号的选取只有一处依据：文档 7 Q16 说初始覆盖「铝 / 不锈钢 / 合金钢」三类。
 *   类目有出处，**具体牌号和 ¥/件 没有任何出处** —— 库里没有材料主数据表
 *   （只有 spec_template 和 pricing_rule，都不是材料清单），
 *   也没有一份真实的成本单。
 *
 *   这里曾经因为同样的原因清空过：定价公式就是按材料算的，
 *   选项是假的，算出来的价也是假的。这一条现在依然成立 ——
 *   区别只是「假」这件事从藏在代码里，变成了写在这里的一句明话。
 *
 *   所以：**演示可以用，报价不能用。** 清掉就是改回 `[]`。
 *   运营在「定价参数」页可以改、可以删、可以加。
 *   真正的解法是后端建材料主数据表，那要等后端开工。
 */
export const DEFAULT_RATES: Rate[] = [
    { mat: '6061-T6 铝', rate: 120 },
    { mat: '7075-T6 铝', rate: 210 },
    { mat: '304 不锈钢', rate: 180 },
    { mat: '316L 不锈钢', rate: 260 },
    { mat: '45 钢', rate: 90 },
    { mat: '40Cr 合金钢', rate: 140 },
]

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
