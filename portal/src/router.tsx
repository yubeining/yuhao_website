import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom'
import { PortalGuard, RootRedirect } from './components/PortalGuard'
import { CustomerShell, OpsShell, SupplierShell } from './components/AppShell'

import { SignInPage } from './pages/auth/SignInPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { VerifyPage } from './pages/auth/VerifyPage'
import { InvitePage } from './pages/auth/InvitePage'
import { SupplierRegisterPage } from './pages/auth/SupplierRegisterPage'
import { SupplierDonePage } from './pages/auth/SupplierDonePage'

import { CustomerHomePage } from './pages/customer/HomePage'
import { QuoteListPage } from './pages/customer/QuoteListPage'
import { QuoteDetailPage } from './pages/customer/QuoteDetailPage'
import { OrderListPage } from './pages/customer/OrderListPage'
import { OrderDetailPage } from './pages/customer/OrderDetailPage'
import { PartFormPage } from './pages/customer/PartFormPage'

import { HallPage } from './pages/supplier/HallPage'
import { HallDetailPage } from './pages/supplier/HallDetailPage'
import { WonPage } from './pages/supplier/WonPage'
import { SupplierOrdersPage } from './pages/supplier/OrdersPage'
import { BillPage } from './pages/supplier/BillPage'
import { SupplierProfilePage } from './pages/supplier/ProfilePage'

import { OpsDashboardPage } from './pages/ops/DashboardPage'
import { OpsQuotesPage } from './pages/ops/QuotesPage'
import { OpsQuoteWorkPage } from './pages/ops/QuoteWorkPage'
import { OpsDispatchPage } from './pages/ops/DispatchPage'
import { OpsOrdersPage } from './pages/ops/OrdersPage'
import { OpsOnboardingPage } from './pages/ops/OnboardingPage'
import { OpsPartiesPage } from './pages/ops/PartiesPage'
import { OpsRatesPage } from './pages/ops/RatesPage'

import { SettingsPage } from './pages/SettingsPage'
import { NotFoundPage } from './pages/NotFoundPage'

/**
 * 路由表。三个端各一棵子树，路径前缀和后端完全一致。
 *
 * ★ 路径前缀即受众 —— 这一点前后端必须对齐：
 *     /customer/**  ↔  CUSTOMER
 *     /supplier/**  ↔  SUPPLIER
 *     /ops/**       ↔  OPERATOR
 *
 *   后端 PortalGuardInterceptor 按同样的前缀硬拒。前后端用同一套前缀，
 *   意味着看一眼 URL 就知道这个页面的受众和它调的接口的受众 ——
 *   review 时不用翻代码。
 *
 * ★ 新增一级路由时记得同步后端的 SpaForwardController ——
 *   否则直接访问 /newportal/xxx 会 404（刷新页面才会暴露，SPA 内跳转看不出来）。
 *   目前的一级前缀是 auth / customer / supplier / ops 四个。
 *
 * ★ 原型里的 screen / tab / area / sel 全部展开成了真实路径。
 *   原型是单页状态机，刷新回登录页；这里每个界面都有自己的地址，
 *   可刷新、可收藏、可以直接发给同事。
 */
export const router = createBrowserRouter([
    { path: '/', element: <RootRedirect /> },

    // ---------- 登录与入驻（无身份可访问）----------
    {
        path: '/auth',
        children: [
            { index: true, element: <Navigate to="/auth/signin" replace /> },
            { path: 'signin', element: <SignInPage /> },
            { path: 'register', element: <RegisterPage /> },
            { path: 'verify', element: <VerifyPage /> },
            { path: 'invite', element: <InvitePage /> },
            { path: 'supplier-register', element: <SupplierRegisterPage /> },
            { path: 'supplier-done', element: <SupplierDonePage /> },
        ],
    },

    // ---------- 欧洲客户端 ----------
    {
        path: '/customer',
        element: (
            <PortalGuard required="customer">
                <CustomerShell><Outlet /></CustomerShell>
            </PortalGuard>
        ),
        children: [
            { index: true, element: <CustomerHomePage /> },
            { path: 'quotes', element: <QuoteListPage /> },
            { path: 'quotes/:id', element: <QuoteDetailPage /> },
            { path: 'orders', element: <OrderListPage /> },
            { path: 'orders/:id', element: <OrderDetailPage /> },
            // ★ new 必须排在 :partId 前面，否则 /parts/new 会被当成 id 为 "new" 的零件
            { path: 'orders/:id/parts/new', element: <PartFormPage /> },
            { path: 'orders/:id/parts/:partId', element: <PartFormPage /> },
            { path: 'settings', element: <SettingsPage /> },
        ],
    },

    // ---------- 供应商端 ----------
    {
        path: '/supplier',
        element: (
            <PortalGuard required="supplier">
                <SupplierOutlet />
            </PortalGuard>
        ),
        children: [
            { index: true, element: <Navigate to="/supplier/hall" replace /> },
            { path: 'hall', element: <HallPage /> },
            { path: 'hall/:id', element: <HallDetailPage /> },
            { path: 'won', element: <WonPage /> },
            { path: 'orders', element: <SupplierOrdersPage /> },
            { path: 'bill', element: <BillPage /> },
            { path: 'profile', element: <SupplierProfilePage /> },
            { path: 'settings', element: <SettingsPage /> },
        ],
    },

    // ---------- 内部后台 ----------
    {
        path: '/ops',
        element: (
            <PortalGuard required="ops">
                <OpsShell><Outlet /></OpsShell>
            </PortalGuard>
        ),
        children: [
            { index: true, element: <Navigate to="/ops/dashboard" replace /> },
            { path: 'dashboard', element: <OpsDashboardPage /> },
            { path: 'quotes', element: <OpsQuotesPage /> },
            // 报价工作台。:id 是订单号 —— 定价是按整单做的，一单一份报价（见 submitOrder）
            { path: 'quotes/:id', element: <OpsQuoteWorkPage /> },
            { path: 'dispatch', element: <OpsDispatchPage /> },
            { path: 'orders', element: <OpsOrdersPage /> },
            { path: 'onboarding', element: <OpsOnboardingPage /> },
            { path: 'parties', element: <OpsPartiesPage /> },
            { path: 'rates', element: <OpsRatesPage /> },
            { path: 'settings', element: <SettingsPage /> },
        ],
    },

    { path: '*', element: <NotFoundPage /> },
])

/**
 * 供应商端的壳要按当前路径决定形态：订单市场通栏、工作台带侧栏。
 * 单独抽出来是因为它需要 useLocation，而路由表本身在组件外求值。
 */
function SupplierOutlet() {
    const { pathname } = useLocation()
    return (
        <SupplierShell full={pathname.startsWith('/supplier/hall')} path={pathname}>
            <Outlet />
        </SupplierShell>
    )
}
