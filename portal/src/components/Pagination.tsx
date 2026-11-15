/**
 * 统一分页控件。
 *
 * ★ 全站列表页都用它，别各自写一套「上一页/下一页」。
 *   输入：当前页（1 起）、每页条数、总数；输出：翻到第几页。
 * ★ 页码窗口化：页多时只显示当前页附近的一段，两端省略号。
 * ★ 只有一页时整块不渲染 —— 别给单页列表挂一个没用的分页条。
 */

import { useMemo } from 'react'
import { useI18n } from '../i18n/I18nProvider'

function windowed(current: number, total: number): (number | '…')[] {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1)
    }
    const pages: (number | '…')[] = [1]
    const lo = Math.max(2, current - 1)
    const hi = Math.min(total - 1, current + 1)
    if (lo > 2) pages.push('…')
    for (let i = lo; i <= hi; i++) pages.push(i)
    if (hi < total - 1) pages.push('…')
    pages.push(total)
    return pages
}

export function Pagination({ page, pageSize, total, onChange }: {
    page: number
    pageSize: number
    total: number
    onChange: (page: number) => void
}) {
    const { t } = useI18n()
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    const pages = useMemo(() => windowed(page, totalPages), [page, totalPages])

    if (totalPages <= 1) return null

    return (
        <div className="pager">
            <span className="pg-total">{t.common.pageTotal(total)}</span>
            <button type="button" className="pg-btn" disabled={page <= 1}
                onClick={() => onChange(page - 1)}>{t.common.prevPage}</button>
            {pages.map((p, i) =>
                p === '…' ? (
                    <span key={`e${i}`} className="pg-ellipsis">…</span>
                ) : (
                    <button key={p} type="button" className={`pg-num${p === page ? ' on' : ''}`}
                        onClick={() => onChange(p)}>{p}</button>
                ),
            )}
            <button type="button" className="pg-btn" disabled={page >= totalPages}
                onClick={() => onChange(page + 1)}>{t.common.nextPage}</button>
            <span className="pg-of">{t.common.pageOf(page, totalPages)}</span>
        </div>
    )
}
