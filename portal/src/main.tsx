import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { I18nProvider } from './i18n/I18nProvider'
import { ThemeProvider } from './components/ThemeProvider'
import { router } from './router'
import './styles.css'

const container = document.getElementById('root')
if (!container) {
    throw new Error('#root not found in index.html')
}

// ★ I18nProvider 在最外层 —— 语言要按「人」判定（账号 locale > 浏览器语言），
//   它读的是登录态，所以必须在能读到会话之前就包住整棵树。
//   ThemeProvider 包在 RouterProvider 外面：主题要在第一屏渲染前就落到 <html> 上。
createRoot(container).render(
    <StrictMode>
        <I18nProvider>
            <ThemeProvider>
                <RouterProvider router={router} />
            </ThemeProvider>
        </I18nProvider>
    </StrictMode>,
)
