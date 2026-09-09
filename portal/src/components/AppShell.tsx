/**
 * 三端共用的应用外壳：深色顶栏 + 深色侧栏 + 浅色主区。
 *
 * ★ 三端共用一个外壳是刻意的 —— 客户、供应商、内部看到的是同一个产品，
 *   区别只在导航项和顶栏右侧的徽标。各端各写一个壳，样式必然漂移。
 *
 * ★ 导航项走 NavLink，aria-current 由 React Router 按当前 URL 自动给，
 *   不自己比字符串 —— 比字符串在嵌套路由下必然漏掉子路径高亮。
 */

import { NavLink, useNavigate } from 'react-router-dom'
import { useState, type ReactNode } from 'react'
import { Logo } from './brand'
import { useMock } from '../mock/MockProvider'
import { currentCompany, currentUser, findCompany, logout } from '../mock/actions'
import { useSession } from '../auth/useSession'
import { clearSession } from '../auth/session'
import { logout as apiLogout } from '../services/auth'

export interface NavItem {
    /** 分组标题。给了 sec 就只渲染标题，其余字段忽略。 */
    sec?: string
    to?: string
    ic?: string
    n?: string
    /** 右侧计数徽标 */
    cnt?: number
    /** 计数标红，用于「需要马上处理」 */
    hot?: boolean
}

/** 顶栏中部的大区切换（供应商端的「订单市场 / 我的工作台」）。 */
export interface AreaTab {
    to: string
    label: string
    /** 判断当前是否在这个大区。大区含多条子路由，靠前缀判断。 */
    match: (path: string) => boolean
}

interface Props {
    children: ReactNode
    /** 侧栏导航。不给则不渲染侧栏（订单市场是通栏的）。 */
    nav?: NavItem[]
    /** 设置页的路径。给了就在侧栏底部固定一个「设置」。 */
    settingsTo?: string
    /** 顶栏右上的徽标文字，和 areas 二选一 */
    badge?: string
    areas?: AreaTab[]
    currentPath?: string
    /** 用户名下方的一行小字：企业名 / 分级 / 身份 */
    sub: string
}

export function AppShell({ children, nav, settingsTo, badge, areas, currentPath, sub }: Props) {
    return (
        <div className="appwrap">
            <GlobalNav badge={badge} areas={areas} currentPath={currentPath} sub={sub} />
            <div className="appshell">
                {nav && <SideNav items={nav} settingsTo={settingsTo} />}
                <main className="appmain">{children}</main>
            </div>
        </div>
    )
}

function GlobalNav({ badge, areas, currentPath, sub }: Pick<Props, 'badge' | 'areas' | 'currentPath' | 'sub'>) {
    return (
        <div className="gnav">
            <div className="gin">
                <div className="gbrand">
                    <div className="gl"><Logo /></div>
                    <span className="gnm">融一智造</span>
                </div>
                {areas ? (
                    <div className="gareas">
                        {areas.map((a) => (
                            <NavLink key={a.to} to={a.to} className="garea"
                                aria-current={currentPath && a.match(currentPath) ? 'page' : undefined}>
                                {a.label}
                            </NavLink>
                        ))}
                    </div>
                ) : (
                    <span className="gsub">{badge}</span>
                )}
                <span className="gsp" />
                {/* ★ 消息按钮整个删掉（2026-09-09）。原先只去掉了未读红点、留着按钮，
                    但按钮本身同样是一句承诺：没有消息系统，点了什么都不会发生。
                    红点是状态、按钮是入口，没有后端时两个都不该在。 */}
                <UserMenu sub={sub} />
            </div>
        </div>
    )
}

/** 身份切换菜单里固定展示的两个槽位 —— 没开通的显示为灰态，而不是隐藏。 */
const ID_SLOTS: [('customer' | 'supplier'), string][] = [
    ['customer', '客户'],
    ['supplier', '供应商'],
]

/**
 * 用户菜单 —— 身份切换 + 退出。
 *
 * ★ 未开通的身份显示成禁用项而不是不显示：让人看见「还能是供应商」
 *   本身就是产品信息。隐藏掉的话，一个客户永远不会知道自己可以入驻。
 */
function UserMenu({ sub }: { sub: string }) {
    const { state, act } = useMock()
    const session = useSession()
    const navigate = useNavigate()
    const [open, setOpen] = useState(false)

    const user = currentUser(state)
    // 身份显示优先用真实登录态(已接后端);mock user 仅在原型演示时兜底
    const displayName = user?.name ?? session?.displayName ?? '用户'
    if (!user && !session) return null
    // 身份切换是原型 mock 专属功能(一个人多身份),真实登录态下暂不提供
    const switchable = !!user && user.roles.some((r) => r.role !== 'ops')

    const signOut = () => {
        // 撤销后端 refresh token(尽力而为,失败也要本地登出)
        if (session?.refreshToken) {
            void apiLogout(session.refreshToken).catch(() => undefined)
        }
        clearSession()
        act(logout)
        navigate('/auth/signin', { replace: true })
    }

    const pickRole = (i: number) => {
        if (!user) return
        act((s) => {
            s.session.roleIndex = i
        })
        setOpen(false)
        navigate(user.roles[i].role === 'supplier' ? '/supplier/hall' : '/customer')
    }

    return (
        <div className="gwrap">
            <button className="guser" type="button" onClick={() => setOpen((v) => !v)}>
                <span className="av">{displayName.slice(-1)}</span>
                <span>
                    <span className="un">{displayName}</span>
                    <span className="ur">{sub}</span>
                </span>
            </button>
            {open && (
                <div className="idmenu down">
                    {switchable && user && (
                        <>
                            <div className="imt">切换身份</div>
                            {ID_SLOTS.map(([role, label]) => {
                                const i = user.roles.findIndex((r) => r.role === role)
                                const on = i >= 0
                                const cur = on && i === state.session.roleIndex
                                const co = on ? findCompany(state, user.roles[i].companyId) : undefined
                                return (
                                    <button key={role} type="button" disabled={!on}
                                        aria-current={cur ? 'true' : undefined}
                                        onClick={on ? () => pickRole(i) : undefined}>
                                        <span>
                                            <span className="ir">{label}</span>
                                            <span className="ip">{on ? co?.name : '未开通'}</span>
                                        </span>
                                        {cur && <span className="ick">✓</span>}
                                    </button>
                                )
                            })}
                            <div className="imd" />
                        </>
                    )}
                    <button className="out" type="button" onClick={signOut}>
                        退出登录
                    </button>
                </div>
            )}
        </div>
    )
}

function SideNav({ items, settingsTo }: { items: NavItem[]; settingsTo?: string }) {
    return (
        <nav className="appnav">
            {items.map((it, i) =>
                it.sec ? (
                    <div className="sec" key={`sec-${i}`}>{it.sec}</div>
                ) : (
                    <NavLink key={it.to} to={it.to!} end={it.to === '/customer'} className="it">
                        <span className="ic">{it.ic}</span>
                        {it.n}
                        {it.cnt ? <span className={`cnt${it.hot ? ' hot' : ''}`}>{it.cnt}</span> : null}
                    </NavLink>
                ),
            )}
            {settingsTo && (
                <div className="navfoot">
                    <NavLink to={settingsTo} className="it">
                        <span className="ic">⚙</span>设置
                    </NavLink>
                </div>
            )}
        </nav>
    )
}

/* ── 三端各自的壳 ─────────────────────────────────────────────────── */

const CUST_NAV: NavItem[] = [
    { sec: '交易' },
    { to: '/customer', ic: '◫', n: '概览' },
    // ★ 订单是整条链的主干：建订单 → 加零件 → 提交 → 确认价格 →（平台安排生产）
    { to: '/customer/orders', ic: '▣', n: '我的订单' },
    { to: '/customer/quotes', ic: '€', n: '我的报价' },
]

export function CustomerShell({ children }: { children: ReactNode }) {
    const { state } = useMock()
    const user = currentUser(state)
    const co = currentCompany(state)
    const sub = (co?.name || '') + (user && user.roles.length > 1 ? ' · 客户身份' : '')
    return (
        <AppShell nav={CUST_NAV} settingsTo="/customer/settings" badge="CUSTOMER" sub={sub}>
            {children}
        </AppShell>
    )
}

const SUP_NAV: NavItem[] = [
    { sec: '接单' },
    { to: '/supplier/won', ic: '◱', n: '我抢到的' },
    { to: '/supplier/orders', ic: '▣', n: '我的订单' },
    { sec: '结算' },
    { to: '/supplier/bill', ic: '¥', n: '对账与开票' },
    { sec: '企业' },
    { to: '/supplier/profile', ic: '⌂', n: '企业资料' },
]

const SUP_AREAS: AreaTab[] = [
    { to: '/supplier/hall', label: '订单市场', match: (p) => p.startsWith('/supplier/hall') },
    { to: '/supplier/orders', label: '我的工作台', match: (p) => !p.startsWith('/supplier/hall') },
]

/** 供应商端。订单市场是通栏（full），工作台带侧栏。 */
export function SupplierShell({ children, full, path }: {
    children: ReactNode
    full?: boolean
    path: string
}) {
    const { state } = useMock()
    const co = currentCompany(state)
    const sub = `${co?.name || ''} · ${co?.status === 'active' ? co.tier + ' 级' : '待考察'}`
    return (
        <AppShell nav={full ? undefined : SUP_NAV} settingsTo="/supplier/settings"
            areas={SUP_AREAS} currentPath={path} sub={sub}>
            {children}
        </AppShell>
    )
}

const OPS_NAV: NavItem[] = [
    { sec: '总览' },
    { to: '/ops/dashboard', ic: '◫', n: '工作台' },
    { sec: '询价与报价' },
    { to: '/ops/quotes', ic: '€', n: '报价' },
    { to: '/ops/dispatch', ic: '⇉', n: '派单管理' },
    { sec: '执行' },
    { to: '/ops/orders', ic: '▣', n: '订单' },
    { sec: '入驻' },
    { to: '/ops/onboarding', ic: '⊕', n: '供应商入驻' },
    { sec: '主数据' },
    { to: '/ops/parties', ic: '⌂', n: '交易方' },
    { to: '/ops/rates', ic: '∑', n: '定价参数' },
]

export function OpsShell({ children }: { children: ReactNode }) {
    return (
        <AppShell nav={OPS_NAV} settingsTo="/ops/settings" badge="OPERATIONS" sub="内部 · 运营">
            {children}
        </AppShell>
    )
}
