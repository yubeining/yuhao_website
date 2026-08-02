import { createBrowserRouter, Navigate } from 'react-router-dom'
import { PortalGuard } from './components/PortalGuard'
import { PortalLayout } from './components/PortalLayout'
import { RootRedirect } from './components/RootRedirect'
import { SignInPage } from './pages/auth/SignInPage'
import { CustomerRfqsPage } from './pages/customer/CustomerRfqsPage'
import { SupplierQuotesPage } from './pages/supplier/SupplierQuotesPage'
import { OpsDashboardPage } from './pages/ops/OpsDashboardPage'
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
 */
export const router = createBrowserRouter([
    {
        path: '/',
        element: <RootRedirect />,
    },
    {
        path: '/auth/signin',
        element: <SignInPage />,
    },

    // ---------- 欧洲客户端 ----------
    {
        path: '/customer',
        element: (
            <PortalGuard required="CUSTOMER">
                <PortalLayout />
            </PortalGuard>
        ),
        children: [
            { index: true, element: <Navigate to="/customer/rfqs" replace /> },
            { path: 'rfqs', element: <CustomerRfqsPage /> },
        ],
    },

    // ---------- 供应商端 ----------
    {
        path: '/supplier',
        element: (
            <PortalGuard required="SUPPLIER">
                <PortalLayout />
            </PortalGuard>
        ),
        children: [
            { index: true, element: <Navigate to="/supplier/quotes" replace /> },
            { path: 'quotes', element: <SupplierQuotesPage /> },
        ],
    },

    // ---------- 内部后台 ----------
    {
        path: '/ops',
        element: (
            <PortalGuard required="OPERATOR">
                <PortalLayout />
            </PortalGuard>
        ),
        children: [
            { index: true, element: <Navigate to="/ops/dashboard" replace /> },
            { path: 'dashboard', element: <OpsDashboardPage /> },
        ],
    },

    { path: '*', element: <NotFoundPage /> },
])
