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
import { finishPricing } from './actions'
import { pricingBlockers } from './params'
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

/**
 * 估价耗时的占位时长。
 *
 * ★ 估价要时间 —— 解析几何、识别特征、算工时。界面上必须表现出这段时间，
 *   不能装成填完材料就有价，那会让客户以为价格是查表查出来的。
 *   接真后端时这里换成轮询或推送。
 */
const PRICING_MS = 5000

/** 估价轮询间隔。没有待估价的单子时这一跳什么都不做，也不写 state。 */
const TICK_MS = 1000

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

    /**
     * 估价工人。
     *
     * ★★ 挂在 Provider 上，**不挂在订单详情页里**。
     *   上一版把这个定时器写在客户的订单详情页 useEffect 里，于是估价只在
     *   客户本人停在那一页时才推进 —— 提交完随手点走，单子就永久停在「估价中」，
     *   运营端也救不回来。估价是平台在后台做的事，不该取决于谁开着哪一页。
     *
     * ★ 只在**真能出价**时才写 state：系数没设全或材料没配基准成本时
     *   finishPricing 本来就会拒绝出价，这里先用 pricingBlockers 判一次，
     *   免得每一跳都 clone + 落盘一遍，白白触发整棵树重渲染。
     *   顺带来了一个正确的行为：卡住的单子在运营把参数配齐的下一跳会自动接着估。
     *
     * ★ 计时从「本次会话第一次看见它在估价」算起，不从 submittedAt 算 ——
     *   落盘的时间戳只到分钟，量不了 5 秒。刷新页面会重新等一轮，这是占位实现
     *   可以接受的代价；接后端之后时间由服务端说了算。
     */
    const seenAt = useRef(new Map<string, number>())

    useEffect(() => {
        const tick = () => {
            const s = latest.current
            const t = Date.now()
            const due = s.db.orders.filter((o) => {
                if (o.status !== 'pricing') return false
                const from = seenAt.current.get(o.id)
                if (from === undefined) {
                    seenAt.current.set(o.id, t)
                    return false
                }
                if (t - from < PRICING_MS) return false
                return pricingBlockers(s.rates, s.params, o.parts).length === 0
            })
            if (!due.length) return
            actWith((next) => due.forEach((o) => finishPricing(next, o.id)))
        }
        const id = window.setInterval(tick, TICK_MS)
        return () => window.clearInterval(id)
        // actWith 是稳定的（useCallback 无依赖），这个 interval 跟着 Provider 活一辈子
    }, [])

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
