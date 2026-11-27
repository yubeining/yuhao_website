/**
 * 三端共用的应用外壳：石墨色侧栏 + 浅色主区，没有顶栏（2026-11-24 改版）。
 *
 * ★ 三端共用一个外壳是刻意的 —— 客户、供应商、内部看到的是同一个产品，
 *   区别只在导航项和侧栏顶部的端标识。各端各写一个壳，样式必然漂移。
 *
 * ★ 原来顶栏上的东西全部收进侧栏：品牌 + 端标识 / 大区切换在顶部，用户菜单在底部。
 *   所以侧栏总是渲染 —— 供应商的订单市场以前是通栏，现在也有侧栏，只是没有导航项。
 *
 * ★ 窄屏（≤900px）侧栏是抽屉：平时收在屏幕左外侧，主区左上角一个菜单按钮拉出来，
 *   点遮罩 / 按 Esc / 跳到别的页面就收回。需求方定的（2026-11-24）：手机上也必须是侧栏，不要横栏。
 *
 * ★ 导航项走 NavLink，aria-current 由 React Router 按当前 URL 自动给，
 *   不自己比字符串 —— 比字符串在嵌套路由下必然漏掉子路径高亮。
 */

import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { Logo } from './brand'
import { UserGlyph } from './icons'
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
    /** 二级目录。父项本身也能点（进第一个子页），子项缩进显示 */
    children?: { to: string; n: string }[]
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
    /** 侧栏导航项。不给则侧栏只有品牌、大区切换和用户菜单（订单市场）。 */
    nav?: NavItem[]
    /** 设置页的路径。给了就在侧栏底部固定一个「设置」。 */
    settingsTo?: string
    /** 全应用提示条（公司信息未完善等），显示在页面内容之上 */
    notice?: ReactNode
    /** 侧栏顶部品牌下的端标识，和 areas 二选一 */
    badge?: string
    areas?: AreaTab[]
    currentPath?: string
    /** 用户名下方的一行小字：企业名 / 分级 / 身份 */
    sub: string
}

export function AppShell({ children, nav, settingsTo, badge, areas, currentPath, sub, notice }: Props) {
    const { t } = useI18n()
    const { pathname } = useLocation()
    // 抽屉开关只在窄屏有意义；宽屏下 CSS 不看这个状态
    const [drawer, setDrawer] = useState(false)
    // 点了导航跳到别的页面就收回抽屉
    useEffect(() => { setDrawer(false) }, [pathname])
    useEffect(() => {
        if (!drawer) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [drawer])
    return (
        <div className={`appshell${drawer ? ' navopen' : ''}`}>
            <SideNav items={nav ?? []} settingsTo={settingsTo} badge={badge}
                areas={areas} currentPath={currentPath} sub={sub} />
            <div className="navmask" onClick={() => setDrawer(false)} />
            <main className="appmain">
                <button className="navtoggle" type="button" aria-label={t.nav.menu}
                    aria-expanded={drawer} onClick={() => setDrawer(true)}>
                    <span /><span /><span />
                </button>
                {notice}
                {children}
            </main>
        </div>
    )
}

/**
 * 用户菜单 —— 只有退出登录。在侧栏底部，菜单向上展开。
 *
 * ★ 设置入口只在侧栏底部的导航项里，菜单里不再放一份（2026-11-27 需求方：底下已经有设置了）。
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
            <button className="guser" type="button" onClick={() => setOpen((v) => !v)} title={displayName}>
                <span className="av"><UserGlyph /></span>
                <span className="uw">
                    <span className="un">{displayName}</span>
                    <span className="ur">{sub}</span>
                </span>
            </button>
            {open && (
                <div className="idmenu">
                    <button className="out" type="button" onClick={signOut}>
                        {t.nav.signOut}
                    </button>
                </div>
            )}
        </div>
    )
}

function SideNav({ items, settingsTo, badge, areas, currentPath, sub }: {
    items: NavItem[]
    settingsTo?: string
} & Pick<Props, 'badge' | 'areas' | 'currentPath' | 'sub'>) {
    const { t } = useI18n()
    return (
        <nav className="appnav">
            <div className="nbrand">
                <div className="gl"><Logo /></div>
                <span className="nbt">
                    {/* i18n-exempt-start: 品牌名不译 */}
                    <span className="gnm">融一智造</span>
                    {/* i18n-exempt-end */}
                    {!areas && badge && <span className="gsub">{badge}</span>}
                </span>
            </div>
            {areas && (
                <div className="gareas">
                    {areas.map((a) => (
                        <NavLink key={a.to} to={a.to} className="garea"
                            aria-current={currentPath && a.match(currentPath) ? 'page' : undefined}>
                            {a.label}
                        </NavLink>
                    ))}
                </div>
            )}
            <div className="navlist">
                {items.map((it, i) =>
                    it.sec ? (
                        <div className="sec" key={`sec-${i}`}>{it.sec}</div>
                    ) : (
                        <div key={it.to}>
                            <NavLink to={it.to!} end={it.to === '/customer'} className="it" title={it.n}>
                                <span className="ic">{it.ic}</span>
                                <span className="lb">{it.n}</span>
                                {it.cnt ? <span className={`cnt${it.hot ? ' hot' : ''}`}>{it.cnt}</span> : null}
                            </NavLink>
                            {it.children && (
                                <div className="subnav">
                                    {it.children.map((c) => (
                                        <NavLink key={c.to} to={c.to} className="it sub">{c.n}</NavLink>
                                    ))}
                                </div>
                            )}
                        </div>
                    ),
                )}
            </div>
            <div className="navfoot">
                {settingsTo && (
                    <NavLink to={settingsTo} className="it" title={t.nav.settings}>
                        <span className="ic">⚙</span><span className="lb">{t.nav.settings}</span>
                    </NavLink>
                )}
                <UserMenu sub={sub} />
            </div>
        </nav>
    )
}

/* ── 三端各自的壳 ─────────────────────────────────────────────────── */

// 客户侧只有两个入口，不再挂分组标题 —— 早期原型留下的「交易」既不是客户的说法，也没有信息量。
// 供应商侧入口多（接单 / 结算 / 企业），分组在那里才有意义。
const customerNav = (t: Strings): NavItem[] => [
    { to: '/customer/orders', ic: '▣', n: t.nav.customer.orders },
    { to: '/customer/quotes', ic: '€', n: t.nav.customer.quotes },
]

export function CustomerShell({ children }: { children: ReactNode }) {
    const { t } = useI18n()
    const navigate = useNavigate()
    // ★ 公司名读后端：真实登录不会写假数据里的「当前公司」，读假数据只会是空
    const [sub, setSub] = useState('')
    // null = 还没读到；读到了才知道要不要提示，避免闪一下
    const [orgName, setOrgName] = useState<string | null>(null)

    useEffect(() => {
        const load = () => getMyOrganization()
            .then((o) => { setSub(o.name); setOrgName(o.name ?? '') })
            // ★ 读失败 ≠ 公司名为空：失败时保持 null（不提示），只有真读到空名才说「未完善」
            .catch(() => setOrgName(null))
        void load()
        // 资料页补完公司名后通知这里，提示条立即消失
        const onUpdated = () => void load()
        window.addEventListener('org-updated', onUpdated)
        return () => window.removeEventListener('org-updated', onUpdated)
    }, [])

    // 公司信息未完善只在「账号层面」提示，不塞进订单流程
    const notice = orgName === '' ? (
        <div className="appnotice">
            <span>{t.profile.companyMissing}</span>
            <button className="linkbtn" type="button" onClick={() => navigate('/customer/settings')}>
                {t.profile.companyFill}
            </button>
        </div>
    ) : undefined

    return (
        <AppShell nav={customerNav(t)} settingsTo="/customer/settings" badge="CUSTOMER" sub={sub} notice={notice}>
            {children}
        </AppShell>
    )
}

const supplierNav = (t: Strings): NavItem[] => [
    { sec: t.nav.supplier.accept },
    { to: '/supplier/orders', ic: '▣', n: t.nav.supplier.orders },
    // 「对账与开票」「企业资料」暂时下线（2026-11-17 需求方定）：两页读的是 mock，
    // 上传发票只改浏览器内存、银行账号和信用代码是编的。后端有了再放回来，页面代码还在。
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

// 按活儿发生的顺序排：报价 → 派单 → 生产 → 客户订单；主数据和账号单独成组。
// 账号管理原来是一个页面里切三个 tab（没有 URL、刷新就丢），现在是二级目录。
const opsNav = (t: Strings): NavItem[] => [
    { sec: t.nav.ops.business },
    { to: '/ops/quotes', ic: '€', n: t.nav.ops.quotes },
    { to: '/ops/quote-settings', ic: '％', n: t.nav.ops.quoteSettings },
    { to: '/ops/cost-rates', ic: '¥', n: t.nav.ops.costRates },
    { to: '/ops/dispatch', ic: '⇉', n: t.nav.ops.dispatch },
    { to: '/ops/production', ic: '⚙', n: t.nav.ops.production },
    { sec: t.nav.ops.masterData },
    { to: '/ops/parties', ic: '⌂', n: t.nav.ops.suppliers },
    {
        to: '/ops/accounts/users', ic: '☰', n: t.nav.ops.accounts,
        children: [
            { to: '/ops/accounts/users', n: t.ops.accounts.tabUsers },
            { to: '/ops/accounts/orgs', n: t.ops.accounts.tabOrgs },
            { to: '/ops/accounts/staff', n: t.ops.accounts.tabStaff },
        ],
    },
]

export function OpsShell({ children }: { children: ReactNode }) {
    const { t } = useI18n()
    return (
        <AppShell nav={opsNav(t)} settingsTo="/ops/settings" badge="OPERATIONS" sub={t.nav.ops.internalOps}>
            {children}
        </AppShell>
    )
}
