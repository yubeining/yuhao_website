/**
 * 日期选择器（自绘）。
 *
 * ★ 为什么不用 `<input type="date">`：它的弹层由浏览器绘制，CSS 完全改不了，
 *   在深色/浅色两套主题下和页面其他控件完全不搭。
 * ★ 为什么不用现成库：这里只需要「选一个日期」——没有区间、没有时间，
 *   禁用规则只有一条可选的「不早于 min」。库自带样式覆盖的工作量不比自绘小，还要多一个依赖。
 *
 * ★★ 日期一律按「本地日历日」处理，绝不经 `Date` 的 UTC 转换：
 *   `new Date('2026-12-01')` 是 UTC 零点，在东八区之外会显示成前一天。
 *   所以内部只传 `YYYY-MM-DD` 字符串，运算用 `new Date(y, m, d)`（本地时区）。
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n/I18nProvider'

const pad = (n: number) => String(n).padStart(2, '0')
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

function parse(iso: string): { y: number; m: number; d: number } | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
    return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1, d: Number(iso.slice(8, 10)) }
}

function today(): { y: number; m: number; d: number } {
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() }
}

/** 本地日历的今天，`YYYY-MM-DD`。给 `min` 用：期望交货日期不能选今天以前（2026-11-27 需求方） */
export function localTodayISO(): string {
    const t = today()
    return toISO(t.y, t.m, t.d)
}

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
/** 0 = 周一（表头从周一开始） */
const firstWeekday = (y: number, m: number) => (new Date(y, m, 1).getDay() + 6) % 7

export function DatePicker({ value, onChange, placeholder, min }: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    /** 最早能选哪天（`YYYY-MM-DD`，含当天）。更早的日子置灰点不了，方向键也走不过去 */
    min?: string
}) {
    const { lang, t } = useI18n()
    const [open, setOpen] = useState(false)
    const initial = parse(value) ?? today()
    const [view, setView] = useState({ y: initial.y, m: initial.m })
    const boxRef = useRef<HTMLDivElement>(null)
    const popRef = useRef<HTMLDivElement>(null)
    /** 弹层用 fixed 定位挂到 body：卡片有 overflow:hidden，留在原地会被裁掉 */
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

    /**
     * 弹层位置：默认在输入框下方；下方放不下、上方放得下时翻到上方；都放不下就贴视口底边。
     * 以前只会往下放，输入框靠近视口底部时日历下半截被裁掉、点不到日期。
     * 弹层高度要等它渲染出来才量得到，没渲染时按 0 算（先放下方，见下面的 useLayoutEffect）。
     */
    const place = () => {
        const rect = boxRef.current?.getBoundingClientRect()
        if (!rect) return null
        const width = 296
        const height = popRef.current?.offsetHeight ?? 0
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
        const below = rect.bottom + 6
        const above = rect.top - 6 - height
        const fitsBelow = below + height <= window.innerHeight - 8
        // 上下都放不下（视口很矮）：贴着视口底边放，盖住输入框也要保证整张日历看得见
        const top = fitsBelow ? below : above >= 8 ? above : Math.max(8, window.innerHeight - 8 - height)
        return { top, left }
    }

    // 外部点击 / Esc 关闭
    useEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => {
            const target = e.target as Node
            if (boxRef.current?.contains(target) || popRef.current?.contains(target)) return
            setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false)
        }
        // ★ 滚动 / 改窗口大小时跟着输入框挪位置，而不是直接关掉。
        //   以前任何滚动都关 —— 点开时浏览器为聚焦把输入框滚进视野，弹层刚打开就没了，看起来像点不开。
        //   输入框整个滚出视口时才关，免得弹层悬在一个看不见的输入框下面。
        const onMove = () => {
            const rect = boxRef.current?.getBoundingClientRect()
            if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) { setOpen(false); return }
            setPos(place())
        }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        window.addEventListener('resize', onMove)
        window.addEventListener('scroll', onMove, true)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
            window.removeEventListener('resize', onMove)
            window.removeEventListener('scroll', onMove, true)
        }
    }, [open])

    // 打开时：视图对准当前值，弹层定位到输入框下方（左边界夹在视口内）
    useEffect(() => {
        if (!open) return
        const cur = parse(value) ?? today()
        setView({ y: cur.y, m: cur.m })
        setPos(place())
    }, [open, value])

    // 第一次打开时弹层还没渲染、量不到高度，先放在下方；渲染出来后（绘制前）按真实高度再定一次
    const placed = pos !== null
    useLayoutEffect(() => {
        if (open && placed) setPos(place())
    }, [open, placed])

    const monthTitle = useMemo(() => {
        const d = new Date(view.y, view.m, 1)
        return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', { year: 'numeric', month: 'long' }).format(d)
    }, [view, lang])

    const weekdays = useMemo(() => {
        const fmt = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', { weekday: 'narrow' })
        // 2024-01-01 是周一
        return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)))
    }, [lang])

    const cells = useMemo(() => {
        const lead = firstWeekday(view.y, view.m)
        const total = daysInMonth(view.y, view.m)
        const prevTotal = daysInMonth(view.y, view.m - 1)
        const out: { iso: string; day: number; out: boolean }[] = []
        for (let i = 0; i < 42; i++) {
            const n = i - lead + 1
            if (n < 1) {
                const d = prevTotal + n
                const m = view.m - 1
                out.push({ iso: toISO(view.y, m, d), day: d, out: true })
            } else if (n > total) {
                const d = n - total
                const m = view.m + 1
                out.push({ iso: toISO(view.y, m, d), day: d, out: true })
            } else {
                out.push({ iso: toISO(view.y, view.m, n), day: n, out: false })
            }
        }
        return out
    }, [view])

    const now = today()
    const todayISO = toISO(now.y, now.m, now.d)

    const shiftMonth = (delta: number) => {
        const m = view.m + delta
        const y = view.y + (m < 0 ? -1 : m > 11 ? 1 : 0)
        setView({ y, m: (m + 12) % 12 })
    }

    const pick = (iso: string) => {
        onChange(iso)
        setOpen(false)
    }

    const onGridKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        const cur = parse(value) ?? today()
        const base = new Date(cur.y, cur.m, cur.d)
        const move = (days: number) => {
            e.preventDefault()
            base.setDate(base.getDate() + days)
            const iso = toISO(base.getFullYear(), base.getMonth(), base.getDate())
            if (min && iso < min) return
            onChange(iso)
            setView({ y: base.getFullYear(), m: base.getMonth() })
        }
        if (e.key === 'ArrowLeft') move(-1)
        else if (e.key === 'ArrowRight') move(1)
        else if (e.key === 'ArrowUp') move(-7)
        else if (e.key === 'ArrowDown') move(7)
        else if (e.key === 'Enter') {
            e.preventDefault()
            setOpen(false)
        }
    }

    return (
        <div className="dp" ref={boxRef}>
            <button type="button" className="inp dp-trigger" onClick={() => setOpen((v) => !v)}>
                <span className={value ? undefined : 'dp-ph'}>{value || placeholder || t.datePicker.placeholder}</span>
                <span className="dp-ic" aria-hidden="true">▦</span>
            </button>

            {open && pos && createPortal(
                <div ref={popRef} className="dp-pop" role="dialog" aria-modal="false"
                    style={{ position: 'fixed', top: pos.top, left: pos.left }}
                    onKeyDown={onGridKeyDown} tabIndex={-1}>
                    <div className="dp-head">
                        <button type="button" className="dp-nav" onClick={() => shiftMonth(-1)} aria-label="prev">‹</button>
                        <span className="dp-title">{monthTitle}</span>
                        <button type="button" className="dp-nav" onClick={() => shiftMonth(1)} aria-label="next">›</button>
                    </div>

                    <div className="dp-wd">
                        {weekdays.map((w) => <span key={w}>{w}</span>)}
                    </div>

                    <div className="dp-grid">
                        {cells.map((c) => (
                            <button
                                key={c.iso}
                                type="button"
                                className={`dp-d${c.out ? ' out' : ''}${c.iso === value ? ' sel' : ''}${c.iso === todayISO ? ' today' : ''}`}
                                disabled={!!min && c.iso < min}
                                onClick={() => pick(c.iso)}
                            >
                                {c.day}
                            </button>
                        ))}
                    </div>

                    <div className="dp-foot">
                        <button type="button" className="dp-link" onClick={() => pick('')}>{t.datePicker.clear}</button>
                        <button type="button" className="dp-link" disabled={!!min && todayISO < min}
                            onClick={() => pick(todayISO)}>{t.datePicker.today}</button>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    )
}
