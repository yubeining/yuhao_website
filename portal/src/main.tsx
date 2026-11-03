import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { I18nProvider } from './i18n/I18nProvider'
import { MockProvider } from './mock/MockProvider'
import { router } from './router'
import './styles.css'

const container = document.getElementById('root')
if (!container) {
    throw new Error('#root not found in index.html')
}

// ★ 两层的顺序不能换：
//   I18nProvider 在最外层 —— 语言要按「人」判定（账号 locale > 浏览器语言），
//   它读的是登录态，所以必须在能读到会话之前就包住整棵树。
//   MockProvider 在里层 —— 它自己不存语言了，只是转手给页面（useMock().t）。
//
//   ★ MockProvider 必须包在 RouterProvider 外面 —— 路由守卫（PortalGuard）
//     要读会话才能决定放不放行，而它在路由树内部。
createRoot(container).render(
    <StrictMode>
        <I18nProvider>
            <MockProvider>
                <RouterProvider router={router} />
            </MockProvider>
        </I18nProvider>
    </StrictMode>,
)
