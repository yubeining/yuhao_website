/**
 * 客户端：报价（后端 CustomerQuoteController）。
 *
 * ★ 客户只看得到对客单价、小计、总计和汇率日期；原价、加成率、汇率数字后端不给（2026-09-17 拍板）。
 * ★ 确认前价格按最新汇率现算，会变；确认时把看到的 rateDate 带回去，服务端汇率已更新就 409 quote.price_changed。
 * ★ 后端不输出值为 null 的字段，可能为空的字段一律可选（见 parts.ts 顶部说明）。
 */

import { http } from '../core/http'
import type { PagedResponse } from './orders'

export type QuoteStatus = 'SENT' | 'SUPERSEDED' | 'REJECTED' | 'CONFIRMED'
export type QuoteCurrency = 'EUR' | 'USD' | 'GBP' | 'CNY'

export interface CustomerQuoteLineView {
    lineId: string
    code: string
    partName: string
    quantity: number
    unitPrice?: number | null
    lineTotal?: number | null
}

export interface CustomerQuoteView {
    id: string
    orderId: string
    status: QuoteStatus
    currency: QuoteCurrency
    /** 交期：确认后多少天 */
    leadDays: number
    /** true = 已确认，价格是确认时锁下的 */
    priceLocked: boolean
    /** 价格所用汇率的日期（YYYY-MM-DD，ECB 发布日） */
    rateDate?: string | null
    total?: number | null
    sentAt: string
    confirmedAt?: string | null
    lines: CustomerQuoteLineView[]
}

export interface CustomerQuoteSummaryView {
    id: string
    orderId: string
    orderTitle?: string | null
    status: QuoteStatus
    currency: QuoteCurrency
    leadDays: number
    priceLocked: boolean
    rateDate?: string | null
    total?: number | null
    sentAt: string
    confirmedAt?: string | null
}

/** 待确认和已确认的报价，最近发出的在前。取不到汇率时待确认的那几条没有 total / rateDate。 */
export function listMyQuotes(page = 1, pageSize = 20): Promise<PagedResponse<CustomerQuoteSummaryView>> {
    return http.get<PagedResponse<CustomerQuoteSummaryView>>(`/customer/quotes?page=${page}&pageSize=${pageSize}`)
}

/**
 * 订单当前的报价：待确认、已确认或刚被自己拒绝的那一版（拒绝的没有价格）。没有 → 404 quote.not_found。
 * 待确认但暂时取不到汇率 → 503 quote.fx_unavailable。
 */
export function getOrderQuote(orderId: string): Promise<CustomerQuoteView> {
    return http.get<CustomerQuoteView>(`/customer/orders/${orderId}/quote`)
}

export function confirmQuote(orderId: string, quoteId: string, rateDate: string): Promise<CustomerQuoteView> {
    return http.post<CustomerQuoteView>(`/customer/orders/${orderId}/quote/confirm`, { quoteId, rateDate })
}

/** 拒绝后订单回到「已提交」，等平台重新报价。 */
export function rejectQuote(orderId: string, quoteId: string): Promise<CustomerQuoteView> {
    return http.post<CustomerQuoteView>(`/customer/orders/${orderId}/quote/reject`, { quoteId })
}
