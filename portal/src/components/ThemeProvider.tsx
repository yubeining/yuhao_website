/**
 * 明暗主题。整个应用一份，选择存在本机。
 *
 * ★ 主题落在 <html data-theme> 上 —— CSS 变量在 :root 上切换，
 *   挂到 body 或某个容器上的话，portal 出去的弹层（日期选择器、确认框）拿不到。
 * ★ localStorage 的 key 沿用原型时期的 `mfg.prototype.theme`：改名的话，
 *   所有人已经选好的主题会丢一次。
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

const THEME_KEY = 'mfg.prototype.theme'

interface ThemeValue {
    theme: Theme
    setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeValue | null>(null)

function readTheme(): Theme {
    try {
        return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
    } catch {
        return 'light'
    }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>(readTheme)

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
        try {
            localStorage.setItem(THEME_KEY, theme)
        } catch {
            // 存不了（隐私模式等）就只在本次会话生效
        }
    }, [theme])

    const value = useMemo(() => ({ theme, setTheme }), [theme])
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeValue {
    const ctx = useContext(ThemeContext)
    if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
    return ctx
}
