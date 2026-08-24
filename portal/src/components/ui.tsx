/**
 * 设计系统里那些反复出现的块。样式全在 styles.css，这里只提供结构。
 *
 * ★ 组件不带任何内联色值 —— 颜色一律由 class 决定，class 由 styles.css 的
 *   CSS 变量驱动。想加一种状态色，去 styles.css 加一个 modifier，不要在这里写 style。
 *
 * ★ 刻意保持"哑"：不取数据、不调 useMock。数据由页面取好再传进来，
 *   这样每个块单看就知道渲染什么，不用顺着 context 追。
 */

import type { CSSProperties, ReactNode } from 'react'

/* ── 状态药丸 ─────────────────────────────────────────────────────── */

/** ok 绿 / wa 黄 / ba 红 / in 蓝 / ne 灰 —— 和 styles.css 的 .pill 修饰符一一对应 */
export type PillTone = 'ok' | 'wa' | 'ba' | 'in' | 'ne'

export function Pill({ tone, children, dot = true }: {
    tone: PillTone
    children: ReactNode
    /** 关掉左侧圆点。纯计数标签（「3 单」）不该有状态点。 */
    dot?: boolean
}) {
    return <span className={`pill ${tone}${dot ? '' : ' nd'}`}>{children}</span>
}

/** [色调, 文案] —— 状态映射表统一用这个形状，见各页顶部的 ORD_ST / QT_ST 等 */
export type PillSpec = [PillTone, string]

export const pill = (spec: PillSpec | undefined, fallback?: PillSpec) => {
    const s = spec || fallback
    return s ? <Pill tone={s[0]}>{s[1]}</Pill> : null
}

/* ── 卡片 ─────────────────────────────────────────────────────────── */

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
    return <div className="card" style={style}>{children}</div>
}

export function CardHead({ title, right, rid }: {
    title?: ReactNode
    /** 标题右侧的补充信息，通常是单号 */
    rid?: ReactNode
    /** 推到最右的操作区 */
    right?: ReactNode
}) {
    return (
        <div className="chead">
            {title != null && <h2>{title}</h2>}
            {rid != null && <span className="rid">{rid}</span>}
            <span className="sp" />
            {right}
        </div>
    )
}

export function CardBody({ children, flush, style }: {
    children: ReactNode
    /** 表格直接贴边时用，去掉内边距 */
    flush?: boolean
    style?: CSSProperties
}) {
    return <div className={`cbody${flush ? ' flush' : ''}`} style={style}>{children}</div>
}

export function CardFoot({ left, right }: { left?: ReactNode; right?: ReactNode }) {
    return (
        <div className="cfoot">
            {left}
            <span className="sp" />
            {right}
        </div>
    )
}

/* ── 页面骨架 ─────────────────────────────────────────────────────── */

export function Page({ children }: { children: ReactNode }) {
    return <div className="page">{children}</div>
}

/** 页头：标题 + 副标题 + 右侧操作。back 出现时渲染成标题上方的返回链接。 */
export function Hello({ title, sub, back, right }: {
    title: ReactNode
    sub?: ReactNode
    back?: ReactNode
    right?: ReactNode
}) {
    return (
        <div className="hello">
            <div>
                {back}
                <h1>{title}</h1>
                {sub != null && <div className="hs">{sub}</div>}
            </div>
            <span className="sp" />
            {right}
        </div>
    )
}

/** 两栏：主内容 + 侧栏。窄屏自动堆叠。 */
export function Cols({ children, style }: { children: ReactNode; style?: CSSProperties }) {
    return <div className="cols" style={style}>{children}</div>
}

export function Stack({ children }: { children: ReactNode }) {
    return <div className="stack">{children}</div>
}

/* ── 表格 ─────────────────────────────────────────────────────────── */

/** 表格必须能横向滚动 —— 列多的表在窄屏下不该把整页撑出横向滚动条。 */
export function TableWrap({ children }: { children: ReactNode }) {
    return <div className="tw"><table>{children}</table></div>
}

/* ── 空状态 ───────────────────────────────────────────────────────── */

export function Empty({ text, sub, action }: { text: string; sub?: string; action?: ReactNode }) {
    return (
        <div className="empty">
            <div className="mk2">◌</div>
            <p>{text}</p>
            {sub && <div className="s2">{sub}</div>}
            {action && <div style={{ marginTop: 14 }}>{action}</div>}
        </div>
    )
}

/* ── 提示条 ───────────────────────────────────────────────────────── */

export function Banner({ tone, icon, children, style }: {
    tone: 'in' | 'wa' | 'ok'
    icon?: string
    children: ReactNode
    style?: CSSProperties
}) {
    return (
        <div className={`ban ${tone}`} style={style}>
            <span className="bi">{icon || (tone === 'wa' ? '!' : tone === 'ok' ? '✓' : 'i')}</span>
            <div>{children}</div>
        </div>
    )
}

/* ── 字段组 ───────────────────────────────────────────────────────── */

export function Fields({ children }: { children: ReactNode }) {
    return <div className="fields">{children}</div>
}

/** mono 用于单号、日期、金额这类需要等宽对齐的值 */
export function Fld({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
    return (
        <div className="fld">
            <span className="k">{k}</span>
            <span className={`v${mono ? ' m' : ''}`}>{v}</span>
        </div>
    )
}

/* ── 键值行（价格分解 / 条款）───────────────────────────────────── */

export function Kv({ children }: { children: ReactNode }) {
    return <div className="kv">{children}</div>
}

export function KvRow({ k, v, total, sans }: {
    k: ReactNode
    v: ReactNode
    /** 合计行：加粗、上方分隔线 */
    total?: boolean
    /** 值不是数字时关掉等宽字体 */
    sans?: boolean
}) {
    return (
        <div className={`kvr${total ? ' tot' : ''}`}>
            <span className="k2">{k}</span>
            <span className="v2" style={sans ? { fontFamily: 'var(--sans)' } : undefined}>{v}</span>
        </div>
    )
}

/* ── 进度条 ───────────────────────────────────────────────────────── */

export function Bar({ pct }: { pct: number }) {
    return <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
}

export function BarLabel({ left, right }: { left: ReactNode; right?: ReactNode }) {
    return <div className="barlab"><span>{left}</span>{right != null && <span>{right}</span>}</div>
}

/* ── 时间线 ───────────────────────────────────────────────────────── */

/**
 * 阶段时间线。**目前没有任何页面在用。**
 *
 * ★★ 曾经用它画过「待排产 / 加工 / 表面处理 / 出厂质检 / 完工」的生产进度，
 *   那五个阶段是编的，而且当前阶段是拿完成数量硬算出来的
 *   （`done >= qty ? 4 : done > 0 ? 1 : 0`），中间两个节点永远不会亮。
 *
 *   组件本身没问题，留着是因为真有阶段数据时它就是对的画法。
 *   **但要用它之前先回答：这些阶段名从哪来、当前阶段谁上报的。**
 *   答不上来就别用 —— 一条画好的流程线看起来极像真的（CLAUDE.md §10 C5）。
 */
export function Timeline({ stages, cur, meta }: {
    stages: string[]
    cur: number
    /** 每个节点下面的小字。不给就不渲染。 */
    meta?: (i: number) => ReactNode
}) {
    return (
        <div className="tl">
            {stages.map((n, i) => (
                <div key={n} className={`tlr ${i < cur ? 'dn' : ''} ${i === cur ? 'hr2' : ''}`}>
                    <div className="tlg">
                        <span className="tln" />
                        {i < stages.length - 1 && <span className="tll" />}
                    </div>
                    <div className="tlb">
                        <div className="tlt">{n}</div>
                        {meta && <div className="tlm">{meta(i)}</div>}
                    </div>
                </div>
            ))}
        </div>
    )
}

/* ── KPI ──────────────────────────────────────────────────────────── */

export function Kpis({ children }: { children: ReactNode }) {
    return <div className="kpis">{children}</div>
}

export function Kpi({ k, v, d, alert }: {
    k: string
    v: ReactNode
    d?: ReactNode
    /** 需要人处理时转黄，用来把待办从一排数字里挑出来 */
    alert?: boolean
}) {
    return (
        <div className={`kpi${alert ? ' alert' : ''}`}>
            <div className="k">{k}</div>
            <div className="v">{v}</div>
            {d != null && <div className="d">{d}</div>}
        </div>
    )
}

/* ── 步骤条 ───────────────────────────────────────────────────────── */

export function StepBar({ names, cur }: { names: string[]; cur: number }) {
    return (
        <div className="steps">
            {names.map((n, i) => (
                <span key={n} style={{ display: 'contents' }}>
                    {i > 0 && <span className="stpl" />}
                    <span className={`stp ${i === cur ? 'on' : i < cur ? 'dn' : ''}`}>
                        <span className="n">{i < cur ? '✓' : i + 1}</span>
                        {n}
                    </span>
                </span>
            ))}
        </div>
    )
}

/* ── 章节小标题 ───────────────────────────────────────────────────── */

export function SectionTitle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
    return <h3 className="sect-t" style={style}>{children}</h3>
}

/* ── 供应商分级徽标 ───────────────────────────────────────────────── */

export function Tier({ tier }: { tier: string }) {
    return <span className={`tier ${tier.toLowerCase()}`}>{tier}</span>
}
