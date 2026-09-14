/**
 * 报价详情。报价还没接上后端（第 3 步），任何报价链接都回到报价列表。
 */

import { Navigate } from 'react-router-dom'

export function QuoteDetailPage() {
    return <Navigate to="/customer/quotes" replace />
}
