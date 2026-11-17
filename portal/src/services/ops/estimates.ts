/**
 * 运营端：AI 成本估算 + 费率表（后端 OpsEstimateController，2026-11-17）。
 *
 * AI 只读图给出重量 / 工时 / 外协，钱由后端按费率表算；结果只是给运营填原价的参考，不参与对客定价。
 */

import { http } from '../core/http'

export type CostRateKind = 'MATERIAL' | 'PROCESS' | 'OUTSOURCE'
export type CostRateUnit = 'KG' | 'HOUR' | 'PIECE' | 'BATCH'

export interface CostRateView {
    id: string
    kind: CostRateKind
    name: string
    unit: CostRateUnit
    unitPriceCny: number
    note?: string | null
    updatedAt: string
}

export interface CostRateInput {
    kind: CostRateKind
    name: string
    unit: CostRateUnit
    unitPriceCny: number
    note?: string | null
}

export interface EstimateItem {
    /** MATERIAL / PROCESS / OUTSOURCE / FIXED */
    kind: string
    name?: string | null
    quantity?: number | null
    unit?: CostRateUnit | null
    /** 费率；FIXED 为 AI 估的金额 */
    unitPriceCny?: number | null
    factor: number
    /** 每件金额；算不出来为空 */
    amount?: number | null
    missing: boolean
    note?: string | null
}

export interface PriceEstimateView {
    id: string
    lineId: string
    outcome: 'ESTIMATED' | 'NOT_MACHINED'
    unitCostCny?: number | null
    complete: boolean
    partTypeReason?: string | null
    material?: string | null
    netWeightKg?: number | null
    blankWeightKg?: number | null
    breakdown: {
        factors: { material: number; machining: number; fixed: number }
        items: EstimateItem[]
        unitCostCny?: number | null
        complete: boolean
    }
    assumptions: string[]
    toConfirm: string[]
    readFiles: string[]
    skippedFiles: string[]
    model: string
    estimatedAt: string
}

/** 读图 + 调看图模型，可能要几十秒。 */
export function estimateLine(orderId: string, lineId: string): Promise<PriceEstimateView> {
    return http.post<PriceEstimateView>(`/ops/customer-orders/${orderId}/lines/${lineId}/estimates`)
}

/** 每一行最新的一次估算；没估过的行不在结果里。 */
export function listLatestEstimates(orderId: string): Promise<PriceEstimateView[]> {
    return http.get<PriceEstimateView[]>(`/ops/customer-orders/${orderId}/estimates`)
}

export function listCostRates(): Promise<CostRateView[]> {
    return http.get<CostRateView[]>('/ops/cost-rates')
}

export function createCostRate(input: CostRateInput): Promise<CostRateView> {
    return http.post<CostRateView>('/ops/cost-rates', input)
}

export function updateCostRate(id: string, input: CostRateInput): Promise<CostRateView> {
    return http.put<CostRateView>(`/ops/cost-rates/${id}`, input)
}

export function deleteCostRate(id: string): Promise<void> {
    return http.delete<void>(`/ops/cost-rates/${id}`)
}
