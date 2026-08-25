/**
 * AI 估价 —— **模拟实现**。
 *
 * ★★★ 这里面**没有模型**。返回的每一个数字都是从零件字段哈希出来的，
 *   算法是「材料基准成本 × 一个由图号决定的固定扰动」。
 *   它唯一忠实的地方是**输出结构**：字段和取值范围严格照文档 8 §5 的契约，
 *   所以将来换成真模型时上层一行都不用改（文档 8 §6：接口从 v0 起就固定）。
 *
 *   **界面上必须始终标明这是模拟输出。**一个假的置信度比没有置信度更危险 ——
 *   它长得和真的一模一样，而运营会照着它决定要不要人工复核（CLAUDE.md §10 C5）。
 *
 * ★ 估的是**基准价 = 制造成本**，不是对客价（文档 8 §1）。
 *   利润率、议价空间是后面两条独立的乘法，绝不能混进这一步 ——
 *   混进去模型就再也说不清自己在预测什么。
 *
 * ★ 材料没配基准成本时**不估**：置信度 0、不给价。
 *   模拟实现唯一的锚点就是那张成本表，表里没有的材料，编一个数出来毫无意义。
 */

import type { OrderPart } from './types'
import type { Rate } from './params'

/**
 * 转人工的置信度阈值。0.75 来自文档 8 Q18。
 * 低于它**不出价，直接转人工**（文档 8 §5）—— 会说「我没把握」的模型才有用。
 */
export const AI_MIN_CONF = 0.75

/** 模拟实现的版本号。真模型上线时这里换成 PRICE_CNC_v* （文档 8 §5）。 */
export const AI_MODEL = 'MOCK-v0'

/**
 * 一次估价的输出。**字段与文档 8 §5 的 JSON 契约一一对应。**
 */
export interface AiEstimate {
    /** 基准价 ¥/件 = 这个零件的制造成本。null = 估不出来 */
    base: number | null
    /** 区间。±30% 就是文档 8 §2 的精度契约本身 */
    range: { low: number; high: number } | null
    /** 0–1。低于 AI_MIN_CONF 转人工 */
    confidence: number
    modelVersion: string
    /** 相似样本数。文档 8 §6：同品类 ≥ 300 条才谈得上拟合 */
    similarSamples: number
    /** 估不出来的原因。有值时 base 一定是 null */
    blocked?: string
    at: string
}

/** FNV-1a。要的只是「同一个零件每次算出来一样」，不需要密码学强度。 */
const hash = (s: string) => {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 0x01000193) >>> 0
    }
    return h
}

/**
 * 估一个零件。
 *
 * ★ 纯函数，**同样的零件永远得到同样的结果** —— 不用 Math.random()。
 *   每次渲染跳一个新价格的界面，一眼就能看出底下是空的；
 *   更要命的是运营刚看过的数第二眼就变了，没法据此做任何决定。
 */
export const estimate = (p: OrderPart, rates: Rate[], now: string): AiEstimate => {
    const rate = rates.find((r) => r.mat === p.mat)?.rate

    if (rate === undefined) {
        return {
            base: null, range: null, confidence: 0,
            modelVersion: AI_MODEL, similarSamples: 0,
            blocked: p.mat ? `材料「${p.mat}」没有基准成本` : '零件没有材料',
            at: now,
        }
    }

    const h = hash(`${p.no}|${p.mat}|${p.qty}|${p.surf}`)

    // 相似样本数越多越有把握 —— 这条相关性是文档 8 §6 的意思，不是拍的
    const similarSamples = 6 + (h % 140)
    const confidence = Math.min(0.95, +(0.55 + similarSamples / 350).toFixed(2))

    // 在材料基准成本上下浮动 ±18%，浮动量由图号决定
    const swing = ((h >>> 8) % 37) / 37 - 0.5
    const base = +(rate * (1 + swing * 0.36)).toFixed(2)

    return {
        base,
        // ±30% 就是精度契约（文档 8 §2），区间不是另外算的
        range: { low: +(base * 0.7).toFixed(2), high: +(base * 1.3).toFixed(2) },
        confidence,
        modelVersion: AI_MODEL,
        similarSamples,
        at: now,
    }
}

/** 这次估价能不能直接采用。低于阈值只出结果、不落价（文档 8 §5）。 */
export const usable = (e: AiEstimate): e is AiEstimate & { base: number } =>
    e.base !== null && e.confidence >= AI_MIN_CONF
