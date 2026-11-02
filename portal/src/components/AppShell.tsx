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
import { useEffect, useState, type ReactNode } from 'react'
import { Logo } from './brand'
import { useSession } from '../auth/useSession'
import { clearSession } from '../auth/session'
import { logout as apiLogout } from '../services/auth'
import { getMyOrganization } from '../services/customer/organization'
import { getMySupplierOrganization } from '../services/supplier/organization'

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

/**
 * 用户菜单 —— 只做退出。
 *
 * ★ 身份切换（一个账号多身份）是原型演示专属功能，2026-11-02 随 mock 层一起删掉：
 *   真实登录下一个账号只属于一个端，不存在「切换」。原来那段代码在空种子下
 *   本来也恒为假 —— 留着只是让人以为这里有功能。
 */
function UserMenu({ sub }: { sub: string }) {
    const session = useSession()
    const navigate = useNavigate()
    const [open, setOpen] = useState(false)

    const displayName = session?.displayName ?? '用户'
    if (!session) return null

    const signOut = () => {
        // 撤销后端 refresh token(尽力而为,失败也要本地登出)
        if (session.refreshToken) {
            void apiLogout(session.refreshToken).catch(() => undefined)
        }
        clearSession()
        navigate('/auth/signin', { replace: true })
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
    // ★ 公司名读后端：真实登录不会写假数据里的「当前公司」，读假数据只会是空
    const [sub, setSub] = useState('')
    useEffect(() => {
        getMyOrganization().then((o) => setSub(o.name)).catch(() => setSub(''))
    }, [])
    return (
        <AppShell nav={CUST_NAV} settingsTo="/customer/settings" badge="CUSTOMER" sub={sub}>
            {children}
        </AppShell>
    )
}

const SUP_NAV: NavItem[] = [
    { sec: '接单' },
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
    // ★ 公司名读后端，和 CustomerShell 一致；读不到就退回角色名「供应商」，
    //   不编一个公司名出来。
    const [sub, setSub] = useState('供应商')
    useEffect(() => {
        getMySupplierOrganization().then((o) => setSub(o.name)).catch(() => setSub('供应商'))
    }, [])
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
    { to: '/ops/production', ic: '⚙', n: '生产与质检' },
    { to: '/ops/orders', ic: '▣', n: '订单' },
    { sec: '入驻' },
    { to: '/ops/onboarding', ic: '⊕', n: '供应商入驻' },
    { sec: '主数据' },
    { to: '/ops/parties', ic: '⌂', n: '交易方' },
]

export function OpsShell({ children }: { children: ReactNode }) {
    return (
        <AppShell nav={OPS_NAV} settingsTo="/ops/settings" badge="OPERATIONS" sub="内部 · 运营">
            {children}
        </AppShell>
    )
}
