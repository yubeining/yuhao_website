/**
 * 原型数据仓的 React 接线。
 *
 * ★ 唯一的写入口是 act(fn)：clone 一份 → 交给 fn 改 → setState + 落盘。
 *   页面里不许直接改 state 对象 —— 改了 React 认不出来，而且不会持久化。
 *
 * ★ 语言与主题也挂在这里。它们和数据仓一样是「整个应用一份」的东西，
 *   再开第二个 Context 只是多一层嵌套。
 */

import {
    createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
    type ReactNode,
} from 'react'
import { clone, loadState, resetState, saveState, type MockState } from './store'
import { STRINGS, type Lang, type Strings } from '../i18n/strings'

export type Theme = 'light' | 'dark'

interface MockContextValue {
    state: MockState
    /** 改数据。回调里拿到的是可以随便改的副本。 */
    act: (fn: (s: MockState) => void) => void
    /**
     * 改数据并同步取一个返回值 —— 新建单据后要拿它的 id 立刻跳转。
     *
     * ★ 不能写成 setState(prev => {...; return next}) 再从闭包里取值：
     *   updater 不保证同步执行，取到的会是 undefined。所以这里从 ref 读当前值，
     *   算完再 setState。
     */
    actWith: <T,>(fn: (s: MockState) => T) => T
    reset: () => void
    lang: Lang
    setLang: (l: Lang) => void
    t: Strings
    theme: Theme
    setTheme: (t: Theme) => void
}

const MockContext = createContext<MockContextValue | null>(null)

const LANG_KEY = 'mfg.prototype.lang'
const THEME_KEY = 'mfg.prototype.theme'

export function MockProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<MockState>(loadState)
    const [lang, setLangState] = useState<Lang>(
        () => (localStorage.getItem(LANG_KEY) as Lang) || 'zh',
    )
    const [theme, setThemeState] = useState<Theme>(
        () => (localStorage.getItem(THEME_KEY) as Theme) || 'light',
    )

    // 连续两次 act（比如「提交询价」里先建 RFQ 再建报价）之间 state 还没重新渲染，
    // 靠 ref 拿到最新值，否则第二次会基于旧数据算。
    const latest = useRef(state)
    latest.current = state

    // 主题落在 <html data-theme> 上 —— CSS 变量在 :root 上切换，
    // 组件不需要知道当前是哪套色，见 styles.css 顶部。
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    useEffect(() => {
        document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
        localStorage.setItem(LANG_KEY, lang)
    }, [lang])

    const actWith = useCallback(<T,>(fn: (s: MockState) => T): T => {
        const next = clone(latest.current)
        const out = fn(next)
        latest.current = next
        saveState(next)
        setState(next)
        return out
    }, [])

    const act = useCallback(
        (fn: (s: MockState) => void) => {
            actWith(fn)
        },
        [actWith],
    )

    const reset = useCallback(() => {
        const fresh = resetState()
        latest.current = fresh
        setState(fresh)
    }, [])

    const value = useMemo<MockContextValue>(
        () => ({
            state, act, actWith, reset,
            lang, setLang: setLangState, t: STRINGS[lang],
            theme, setTheme: setThemeState,
        }),
        [state, act, actWith, reset, lang, theme],
    )

    return <MockContext.Provider value={value}>{children}</MockContext.Provider>
}

export function useMock() {
    const ctx = useContext(MockContext)
    if (!ctx) throw new Error('useMock 必须在 <MockProvider> 内使用')
    return ctx
}
