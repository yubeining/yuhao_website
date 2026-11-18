/**
 * 账号管理三个子页（外部用户 / 组织 / 运营账号）共用的列表逻辑和小组件。
 *
 * ★ 2026-11-17 从 AccountsPage.tsx 拆出：三个 tab 的加载、搜索、分页、启用/禁用、
 *   三态展示原来各写了一遍，同一个修复要改三处，漏一处三个 tab 就表现不一致。
 *   行为与拆分前逐行一致，只是换了位置。
 */

import { useAutoClear } from '../../../components/useAutoClear'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageParam } from '../../../components/usePageParam'
import { Pagination } from '../../../components/Pagination'
import { Banner, Empty, Pending, Pill } from '../../../components/ui'
import { errorText } from '../../../i18n/errorText'
import { useMock } from '../../../mock/MockProvider'
import { fmtDate } from '../../../mock/format'

export const PAGE_SIZE = 20

/** 本地日期。以前直接截 ISO 字符串的前 10 位，那是 UTC 日期，东八区凌晨注册的会显示成前一天。 */
export const day = (iso: string | null) => (iso ? fmtDate(new Date(iso)) : '—')

/**
 * 一个分页列表的全部状态：数据、页码、搜索、错误 / 成功提示、busy。
 *
 * ★ 输入框里的字（q）和「已生效的条件」（applied）分开：只有回车 / 点查询才生效并回第 1 页。
 *   以前 load 直接依赖 q，每敲一个字就查一次，且停在原页码 —— 在第 4 页搜邮箱会显示「无用户」。
 *   条件没变时点「查询」也会重新拉一次（靠 searchTick）。
 * ★ fetchPage 要用 useCallback 包住；它变了（比如组织 tab 的类型筛选变了）就重新加载。
 */
export function usePagedList<T>(fetchPage: (q: string, pageNo: number) => Promise<{ items: T[]; total: number }>) {
    const { t } = useMock()
    const [rows, setRows] = useState<T[] | null>(null)
    const [total, setTotal] = useState(0)
    // ★ 页码和已生效的搜索词放在网址里（?q=...&page=3）：刷新、转发、从别处返回都不丢（2026-11-18）。
    const [params, setParams] = useSearchParams()
    const [page, setPage] = usePageParam()
    const appliedQ = params.get('q') ?? ''
    const [q, setQ] = useState(appliedQ)
    /** 点一次「查询」加一：条件没变时也重新拉一次（网址没变，光靠它触发不了重新加载）。 */
    const [searchTick, setSearchTick] = useState(0)
    const applied = useMemo(() => ({ q: appliedQ, tick: searchTick }), [appliedQ, searchTick])
    const [err, setErr] = useState<string | null>(null)
    const [ok, setOk] = useState<string | null>(null)
    useAutoClear(ok, () => setOk(null))
    const [busy, setBusy] = useState(false)

    const load = useCallback(async (pageNo: number) => {
        try {
            const pg = await fetchPage(applied.q, pageNo)
            setRows(pg.items)
            setTotal(pg.total)
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [fetchPage, applied, t])

    useEffect(() => { void load(page) }, [load, page])

    const search = () => {
        setParams((prev) => {
            const next = new URLSearchParams(prev)
            if (q) next.set('q', q); else next.delete('q')
            next.delete('page')
            return next
        }, { replace: true })
        setSearchTick((n) => n + 1)
    }

    /** 行内动作（禁用 / 启用）：busy → 调接口 → 成功提示 + 重新加载当前页；失败显示错误。 */
    const act = async (run: () => Promise<unknown>, okText: string) => {
        setBusy(true)
        try {
            await run()
            setOk(okText)
            await load(page)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    return { rows, total, page, setPage, q, setQ, applied, err, setErr, ok, setOk, busy, setBusy, load, search, act }
}

export type PagedList<T> = ReturnType<typeof usePagedList<T>>

/** 页面顶部的错误 / 成功横幅。数据还没到时错误交给 Pending 显示，这里不重复。 */
export function ListBanners<T>({ list }: { list: PagedList<T> }) {
    return <>
        {list.err && list.rows !== null && <Banner tone="wa" style={{ marginBottom: 14 }}>{list.err}</Banner>}
        {list.ok && <Banner tone="in" style={{ marginBottom: 14 }}>{list.ok}</Banner>}
    </>
}

/**
 * 列表主体 + 分页。三态：null = 加载中 / 出错（带重试），[] = 确实为空 ——
 * 以前加载中就显示「还没有」。有筛选条件时空结果显示「没有匹配的结果」，由调用方传 emptyText。
 */
export function ListBody<T>({ list, emptyText, children }: {
    list: PagedList<T>
    emptyText: string
    children: (rows: T[]) => ReactNode
}) {
    return <>
        {list.rows === null ? (
            <Pending err={list.err} onRetry={() => void list.load(list.page)} />
        ) : list.rows.length ? (
            children(list.rows)
        ) : (
            <Empty text={emptyText} />
        )}
        <Pagination page={list.page} pageSize={PAGE_SIZE} total={list.total} onChange={list.setPage} />
    </>
}

export function StatusPill({ status, label }: { status: string; label: string }) {
    return status === 'ACTIVE'
        ? <Pill tone="ok">{label}</Pill>
        : <Pill tone="wa">{label}</Pill>
}

/** 每行最右边的「编辑 + 禁用 / 启用」。 */
export function RowActions({ status, busy, onEdit, onDisable, onEnable }: {
    status: string
    busy: boolean
    onEdit: () => void
    onDisable: () => void
    onEnable: () => void
}) {
    const { t } = useMock()
    const a = t.ops.accounts
    return (
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            <button className="btn sm" type="button" onClick={onEdit}>{a.edit}</button>
            {status === 'ACTIVE'
                ? <button className="btn sm" type="button" disabled={busy} onClick={onDisable}>{a.disable}</button>
                : <button className="btn sm" type="button" disabled={busy} onClick={onEnable}>{a.enable}</button>}
        </td>
    )
}

/** 弹框里不可改的字段：值 + 灰色说明（如「不可修改」）。 */
export function ReadOnly({ value, note }: { value: ReactNode; note: string }) {
    return <div style={{ padding: '9px 0' }}>{value}<span className="fnote">{note}</span></div>
}

/** 原生 select：value 用 id、显示用名字 —— 共享的 Select 只接受字符串数组，装不下 id。 */
export function SelectId({ value, onChange, options, placeholder }: {
    value: string
    onChange: (v: string) => void
    options: { id: string; label: string }[]
    placeholder: string
}) {
    return (
        <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{placeholder}</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
    )
}

/** 搜索栏里的一格：标签在输入框上方，和「查询」按钮同一行底部对齐。 */
export function FilterField({ label, children }: { label: string; children: ReactNode }) {
    return <div className="ff"><span className="ff-k">{label}</span>{children}</div>
}
