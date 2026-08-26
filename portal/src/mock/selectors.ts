/**
 * 派生查询。页面用的「我的 xx」「进度百分比」这类算出来的东西。
 *
 * ★ 和 actions.ts 分开：这里全是只读的纯函数，不改 state。
 *   混在一起的话，review 时得逐个看签名才知道哪个会写数据。
 */

import { num } from './params'
import { currentCompany, type findCompany } from './actions'
import type { MockState } from './store'
import type { Order, Prod, Quote } from './types'



export const myQuotes = (s: MockState) => {
    const c = currentCompany(s)
    return c ? s.db.quotes.filter((q) => q.companyId === c.id) : []
}

export const myOrders = (s: MockState) => {
    const c = currentCompany(s)
    return c ? s.db.orders.filter((o) => o.companyId === c.id) : []
}

/** 当前供应商抢到的生产订单 */
export const myProds = (s: MockState) => {
    const c = currentCompany(s)
    return c ? s.db.prods.filter((d) => d.sup === c.id) : []
}

export const quoteOf = (s: MockState, o: Order): Quote | undefined =>
    s.db.quotes.find((q) => q.id === o.quoteId)

/** 一个订单的所有报价版本（补齐之后会出新版） */
export const quotesOf = (s: MockState, orderId: string) =>
    s.db.quotes.filter((q) => q.orderId === orderId)

export const orderTotal = (s: MockState, o: Order) => quoteOf(s, o)?.total ?? 0

/**
 * 订单完成度 %。
 *
 * ★ 分母排除已退回的行 —— 退回的行不生产也不计费，
 *   算进分母的话进度永远到不了 100%，客户会以为卡住了。
 */
export const progress = (o: Order) => {
    const live = o.parts.filter((p) => p.st && !p.dropped)
    if (!live.length) return 0
    const done = live.reduce((a, p) => a + num(p.done), 0)
    const total = live.reduce((a, p) => a + num(p.qty), 0)
    return Math.round((done / Math.max(1, total)) * 100)
}

/**
 * 装着这个客户订单零件的所有生产订单。
 *
 * ★ 是「装着」不是「属于」：一个生产订单可以同时装别的客户的零件，
 *   所以这里返回的生产订单上还有跟这个客户无关的行。
 */
export const prodsOf = (s: MockState, orderId: string): Prod[] =>
    s.db.prods.filter((d) => d.lines.some((l) => l.orderId === orderId))

export const contractOf = (s: MockState, prodId: string) =>
    s.db.contracts.find((c) => c.prodId === prodId)

export const openProds = (s: MockState) => s.db.prods.filter((d) => d.status === 'open')

/** 还在组、没挂出去的生产订单 —— 运营的在途工作 */
export const draftProds = (s: MockState) => s.db.prods.filter((d) => d.status === 'draft')

/** 已确认价格、等着发布到订单市场的订单 —— 内部端的待办 */
export const confirmedOrders = (s: MockState) => s.db.orders.filter((o) => o.status === 'toPublish')

/** 已安排生产、产能还没锁满的订单 */
export const publishedOrders = (s: MockState) => s.db.orders.filter((o) => o.status === 'published')

export const pendingSuppliers = (s: MockState) =>
    s.db.companies.filter((c) => c.status === 'review')

export type CompanyLookup = typeof findCompany
