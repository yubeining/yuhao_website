/**
 * 运营端：客户加成率、报价（后端 OpsQuoteController）。
 *
 * 对客价 = 原价 × 汇率 × 客户加成率（设计文档 13 §2）；加成率 1.2 = 加价 20%。
 * 计算全在后端，前端只显示后端算好的数（试算也走后端），不自己乘。
 */

import { http } from '../core/http'
import type { QuoteCurrency, QuoteStatus } from '../customer/quotes'

export const QUOTE_CURRENCIES: QuoteCurrency[] = ['EUR', 'USD', 'GBP', 'CNY']

export interface MarkupView {
    customerOrgId: string
    /** 没设过时为空 */
    markupRate?: number | null
    updatedAt?: string | null
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
    leadDays: number
    /** 发出时的加成率快照 */
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

export interface QuotePreviewView {
    currency: QuoteCurrency
    markupRate: number
    rateDate: string
    fxEurCny: number
    fxEurQuote: number
    total: number
    lines: OpsQuoteLineView[]
}

export interface SendQuoteInput {
    currency: QuoteCurrency
    /** 交期：客户确认后多少天 */
    leadDays: number
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

/** 这张单的全部报价版本，新的在前。 */
export function listOrderQuotes(orderId: string): Promise<OpsQuoteView[]> {
    return http.get<OpsQuoteView[]>(`/ops/customer-orders/${orderId}/quotes`)
}

/** 发出前试算，不落库。 */
export function previewQuote(orderId: string, input: SendQuoteInput): Promise<QuotePreviewView> {
    return http.post<QuotePreviewView>(`/ops/customer-orders/${orderId}/quotes/preview`, input)
}

/** 发出（或重报：旧的待确认版本作废）。 */
export function sendQuote(orderId: string, input: SendQuoteInput): Promise<OpsQuoteView> {
    return http.post<OpsQuoteView>(`/ops/customer-orders/${orderId}/quotes`, input)
}
