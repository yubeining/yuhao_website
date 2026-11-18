/**
 * 页码放在网址里（?page=3），不放 useState：进详情页再返回、刷新、转发链接都停在原来那一页。
 *
 * 第 1 页不写参数，网址保持干净；用 replace 不产生历史记录，翻页不会塞满「后退」。
 * 2026-11-18 从运营报价页的写法抽出来，各列表共用。
 */

import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

export function usePageParam(key = 'page'): [number, (page: number) => void] {
    const [params, setParams] = useSearchParams()
    const page = Math.max(1, Number(params.get(key)) || 1)
    const setPage = useCallback((p: number) => setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (p > 1) next.set(key, String(p)); else next.delete(key)
        return next
    }, { replace: true }), [key, setParams])
    return [page, setPage]
}
