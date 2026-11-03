/**
 * 语言的唯一出口。页面只通过 useI18n() 拿 `t` / `lang` / `setLang`。
 *
 * ★ 为什么单独一个 Provider，而不是继续挂在 MockProvider 上：
 *   语言是产品行为（跟人走、跟账号走），mock 是待拆除的原型层。
 *   两者混在一起，将来删 mock 时会把语言一起删掉。
 *
 * ★ 已登录时以后端返回的 locale 为准 —— 那是用户在别的设备上选过的，
 *   比浏览器探测准。用户在本机手动切换后，会覆盖它（见 lang.ts 的优先级）。
 */

import {
    createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
import { STRINGS, type Strings } from './strings'
import { detect, getUserLang, setUserLang, subscribeLang, type Lang } from './lang'
import { useSession } from '../auth/useSession'

interface I18nValue {
    lang: Lang
    t: Strings
    /** 用户主动切换。会写入本地，已登录时同步到账号（接口见后续）。 */
    setLang: (lang: Lang) => void
    toggleLang: () => void
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
    const session = useSession()

    // 首次渲染就要定下来，不能先渲染英文再闪一下 —— 那一下闪动用户看得到
    const [lang, setLangState] = useState<Lang>(() => detect(session?.locale))

    // 登录后 / 账号 locale 变了：只要用户没手动选过，就跟随账号
    useEffect(() => {
        if (getUserLang()) return
        setLangState(detect(session?.locale))
    }, [session?.locale])

    // 别的标签页改了语言，这里跟着变
    useEffect(() => subscribeLang((next) => setLangState(next)), [])

    // <html lang> 影响屏幕阅读器和浏览器翻译提示，必须跟当前语言一致
    useEffect(() => {
        document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    }, [lang])

    const setLang = useCallback((next: Lang) => {
        // 走 lang.ts 而不是直接 setState：手选要落盘，且要通知其它标签页
        setUserLang(next)
        setLangState(next)
    }, [])

    const toggleLang = useCallback(() => {
        setLangState((cur) => {
            const next: Lang = cur === 'zh' ? 'en' : 'zh'
            setUserLang(next)
            return next
        })
    }, [])

    const value = useMemo<I18nValue>(
        () => ({ lang, t: STRINGS[lang], setLang, toggleLang }),
        [lang, setLang, toggleLang],
    )

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
    const ctx = useContext(I18nContext)
    if (!ctx) throw new Error('useI18n 必须在 <I18nProvider> 内使用')
    return ctx
}
