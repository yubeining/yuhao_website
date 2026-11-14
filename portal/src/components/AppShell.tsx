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
import { useI18n } from '../i18n/I18nProvider'
import type { Strings } from '../i18n/strings'

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
                    {/* i18n-exempt-start: 品牌名不译 */}
                    <span className="gnm">融一智造</span>
                    {/* i18n-exempt-end */}
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
    const { t } = useI18n()
    const session = useSession()
    const navigate = useNavigate()
    const [open, setOpen] = useState(false)

    const displayName = session?.displayName ?? t.nav.defaultUser
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
                        {t.nav.signOut}
                    </button>
                </div>
            )}
        </div>
    )
}

function SideNav({ items, settingsTo }: { items: NavItem[]; settingsTo?: string }) {
    const { t } = useI18n()
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
                        <span className="ic">⚙</span>{t.nav.settings}
                    </NavLink>
                </div>
            )}
        </nav>
    )
}

/* ── 三端各自的壳 ─────────────────────────────────────────────────── */

const customerNav = (t: Strings): NavItem[] => [
    { sec: t.nav.customer.trade },
    { to: '/customer', ic: '◫', n: t.nav.customer.overview },
    // ★ 订单是整条链的主干：建订单 → 加零件 → 提交 → 确认价格 →（平台安排生产）
    { to: '/customer/orders', ic: '▣', n: t.nav.customer.orders },
    { to: '/customer/quotes', ic: '€', n: t.nav.customer.quotes },
]

export function CustomerShell({ children }: { children: ReactNode }) {
    const { t } = useI18n()
    // ★ 公司名读后端：真实登录不会写假数据里的「当前公司」，读假数据只会是空
    const [sub, setSub] = useState('')
    useEffect(() => {
        getMyOrganization().then((o) => setSub(o.name)).catch(() => setSub(''))
    }, [])
    return (
        <AppShell nav={customerNav(t)} settingsTo="/customer/settings" badge="CUSTOMER" sub={sub}>
            {children}
        </AppShell>
    )
}

const supplierNav = (t: Strings): NavItem[] => [
    { sec: t.nav.supplier.accept },
    { to: '/supplier/orders', ic: '▣', n: t.nav.supplier.orders },
    { sec: t.nav.supplier.settlement },
    { to: '/supplier/bill', ic: '¥', n: t.nav.supplier.bill },
    { sec: t.nav.supplier.company },
    { to: '/supplier/profile', ic: '⌂', n: t.nav.supplier.profile },
]

const supplierAreas = (t: Strings): AreaTab[] => [
    { to: '/supplier/hall', label: t.nav.supplier.hall, match: (p) => p.startsWith('/supplier/hall') },
    { to: '/supplier/orders', label: t.nav.supplier.workspace, match: (p) => !p.startsWith('/supplier/hall') },
]

/** 供应商端。订单市场是通栏（full），工作台带侧栏。 */
export function SupplierShell({ children, full, path }: {
    children: ReactNode
    full?: boolean
    path: string
}) {
    // ★ 公司名读后端，和 CustomerShell 一致；读不到就退回角色名「供应商」，
    //   不编一个公司名出来。
    const { t } = useI18n()
    const [sub, setSub] = useState(t.nav.supplierFallback)
    useEffect(() => {
        getMySupplierOrganization().then((o) => setSub(o.name)).catch(() => setSub(t.nav.supplierFallback))
    }, [t.nav.supplierFallback])
    return (
        <AppShell nav={full ? undefined : supplierNav(t)} settingsTo="/supplier/settings"
            areas={supplierAreas(t)} currentPath={path} sub={sub}>
            {children}
        </AppShell>
    )
}

const opsNav = (t: Strings): NavItem[] => [
    { sec: t.nav.ops.overview },
    { to: '/ops/dashboard', ic: '◫', n: t.nav.ops.dashboard },
    { sec: t.nav.ops.quoting },
    { to: '/ops/quotes', ic: '€', n: t.nav.ops.quotes },
    { to: '/ops/dispatch', ic: '⇉', n: t.nav.ops.dispatch },
    { sec: t.nav.ops.execution },
    { to: '/ops/production', ic: '⚙', n: t.nav.ops.production },
    { to: '/ops/orders', ic: '▣', n: t.nav.ops.orders },
    { sec: t.nav.ops.masterData },
    { to: '/ops/parties', ic: '⌂', n: t.nav.ops.parties },
    { to: '/ops/accounts', ic: '☰', n: t.nav.ops.accounts },
]

export function OpsShell({ children }: { children: ReactNode }) {
    const { t } = useI18n()
    return (
        <AppShell nav={opsNav(t)} settingsTo="/ops/settings" badge="OPERATIONS" sub={t.nav.ops.internalOps}>
            {children}
        </AppShell>
    )
}
