/**
 * 运营端：报价系数、报价设置、报价（后端 OpsQuoteController）。
 *
 * 对客价 = 原价 × 汇率 × 报价系数（设计文档 13 §2）；系数 1.2 = 原价 ×1.2。
 * 计算全在后端，前端只显示后端算好的数（试算也走后端），不自己乘。
 */

import { http } from '../core/http'
import type { PagedResponse } from '../customer/orders'
import type { QuoteCurrency, QuoteStatus } from '../customer/quotes'

export const QUOTE_CURRENCIES: QuoteCurrency[] = ['EUR', 'USD', 'GBP', 'CNY']

export interface MarkupView {
    customerOrgId: string
    /** 公司自己的值；为空 = 用全局默认 */
    markupRate?: number | null
    updatedAt?: string | null
    /** 全局默认值；没设置时为空 */
    defaultRate?: number | null
    /** 实际生效的值（公司值优先，其次默认）；两者都没有时为空 */
    effectiveRate?: number | null
}

export interface OpsQuoteLineView {
    lineId: string
    code: string
    partName: string
    quantity: number
    /** 原价 ¥/件 */
    unitPriceCny: number
    unitPrice?: number | null
    lineTotal?: number | null
}

export interface OpsQuoteView {
    id: string
    versionNo: number
    status: QuoteStatus
    currency: QuoteCurrency
    /** 承诺交期（YYYY-MM-DD） */
    commitDate: string
    /** 发出时的报价系数快照 */
    markupRate: number
    sentAt: string
    confirmedAt?: string | null
    rejectedAt?: string | null
    /** true = 客户已确认，下面的汇率和价格是确认时的快照；否则是按最新汇率现算（只对待确认的算） */
    priceLocked: boolean
    rateDate?: string | null
    fxEurCny?: number | null
    fxEurQuote?: number | null
    total?: number | null
    lines: OpsQuoteLineView[]
}

export interface SendQuoteInput {
    currency: QuoteCurrency
    /** 承诺交期（YYYY-MM-DD），必须晚于今天 */
    commitDate: string
    /** 必须和订单行一一对应 */
    lines: { lineId: string; unitPriceCny: number }[]
}

/** 订单最新一版报价的版本号和状态。没报过价的单不在结果里。 */
export interface OpsQuoteSummaryView {
    orderId: string
    latestVersionNo: number
    latestStatus: QuoteStatus
}

/** 一次最多 200 个订单。 */
export function listQuoteSummaries(orderIds: string[]): Promise<OpsQuoteSummaryView[]> {
    if (!orderIds.length) return Promise.resolve([])
    return http.get<OpsQuoteSummaryView[]>(`/ops/quote-summaries?orderIds=${orderIds.join(',')}`)
}

export function getCustomerMarkup(orgId: string): Promise<MarkupView> {
    return http.get<MarkupView>(`/ops/customers/${orgId}/markup`)
}

export function setCustomerMarkup(orgId: string, markupRate: number): Promise<MarkupView> {
    return http.put<MarkupView>(`/ops/customers/${orgId}/markup`, { markupRate })
}

/** 清掉公司自己的系数 → 回落到全局默认。 */
export function clearCustomerMarkup(orgId: string): Promise<MarkupView> {
    return http.delete<MarkupView>(`/ops/customers/${orgId}/markup`)
}

/** 报价设置的一行：公司自己的系数（空 = 用默认）和实际生效值。 */
export interface QuoteCompanyRate {
    orgId: string
    name?: string | null
    markupRate?: number | null
    effectiveRate?: number | null
}

export interface QuoteSettingsView {
    /** 全局默认；未设置时为空 */
    defaultRate?: number | null
    companies: PagedResponse<QuoteCompanyRate>
}

export function getQuoteSettings(page = 1, pageSize = 20): Promise<QuoteSettingsView> {
    return http.get<QuoteSettingsView>(`/ops/quote-settings?page=${page}&pageSize=${pageSize}`)
}

export function setQuoteDefaultMarkup(markupRate: number): Promise<{ markupRate: number }> {
    return http.put<{ markupRate: number }>('/ops/quote-settings/default-markup', { markupRate })
}

/** 这张单的全部报价版本，新的在前。 */
export function listOrderQuotes(orderId: string): Promise<OpsQuoteView[]> {
    return http.get<OpsQuoteView[]>(`/ops/customer-orders/${orderId}/quotes`)
}

/** 发出前试算，不落库。 */
/** 发出（或重报：旧的待确认版本作废）。 */
export function sendQuote(orderId: string, input: SendQuoteInput): Promise<OpsQuoteView> {
    return http.post<OpsQuoteView>(`/ops/customer-orders/${orderId}/quotes`, input)
}
