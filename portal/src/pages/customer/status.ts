/**
 * 客户端的状态 → 药丸映射。
 *
 * ★ 状态文案集中在这里，页面不写字面量 —— 同一个状态在列表、详情、
 *   概览三处出现，散着写迟早出现「生产中 / 加工中」这种同状态两种说法。
 */

import type { PillSpec } from '../../components/ui'
import type { Order, OrderItem, Quote, Rfq } from '../../mock/types'

export const ORD_ST: Record<Order['status'], PillSpec> = {
    capacity: ['wa', '产能确认中'],
    confirmed: ['in', '生产中'],
    delivered: ['ok', '已交付'],
}

export const RFQ_ST: Record<Rfq['status'], PillSpec> = {
    draft: ['ne', '草稿'],
    quoting: ['in', '已报价'],
}

export const QT_ST: Record<Quote['status'], PillSpec> = {
    open: ['in', '待确认'],
    accepted: ['ok', '已接受'],
    expired: ['ne', '已过期'],
}

export const IT_ST: Record<OrderItem['st'], PillSpec> = {
    pending: ['wa', '产能确认中'],
    open: ['wa', '产能确认中'],
    taken: ['in', '生产中'],
    done: ['ok', '已完工'],
    dropped: ['ba', '已退回'],
}

/** 整单进度的五个阶段 */
export const ORD_STAGES = ['订单确认', '生产', '出厂质检', '运输', '送达']

/** 单个零件行的五个阶段 */
export const LINE_STAGES = ['待排产', '加工', '表面处理', '出厂质检', '完工']
