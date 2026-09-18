/**
 * 「我抢到的」并进了「我的订单」（2026-09-18，第 4 步）：接下的单统一在我的订单里看、退。
 * 保留这个路由只为旧链接不 404。
 */

import { Navigate } from 'react-router-dom'

export function WonPage() {
    return <Navigate to="/supplier/orders" replace />
}
