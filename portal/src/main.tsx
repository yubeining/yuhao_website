import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { MockProvider } from './mock/MockProvider'
import { router } from './router'
import './styles.css'

const container = document.getElementById('root')
if (!container) {
    throw new Error('#root not found in index.html')
}

// ★ MockProvider 必须包在 RouterProvider 外面 —— 路由守卫（PortalGuard）
//   要读会话才能决定放不放行，而它在路由树内部。
//   接上真后端时这一层换成真实的登录态 Provider，位置不变。
createRoot(container).render(
    <StrictMode>
        <MockProvider>
            <RouterProvider router={router} />
        </MockProvider>
    </StrictMode>,
)
