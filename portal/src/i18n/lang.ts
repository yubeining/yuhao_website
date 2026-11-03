/**
 * 语言判定的唯一入口。
 *
 * ★ 这个文件是「按人切语言」的全部逻辑。任何地方想知道该用哪种语言，
 *   只能调 detect() —— 不要在页面里自己读 navigator 或 localStorage。
 *
 * ★ 优先级（从高到低）：
 *     1. 用户手动选过        localStorage['mfg.lang.user']
 *     2. 账号里存的 locale   登录响应里的 locale
 *     3. 浏览器首选语言      navigator.languages
 *     4. 兜底               'en'
 *
 * ★★ 为什么「手选」和「探测」必须分开存：
 *   如果只存一个 mfg.lang，那么用户手动选了中文之后，换一台浏览器（英文系统），
 *   探测结果会把他的选择覆盖掉 —— 下次回来又变英文。这类 bug 很难复现，
 *   因为要换设备/换浏览器才会出现。
 *   所以：手选写 mfg.lang.user，探测结果永远不落盘。
 *
 * ★ 不做 IP 地理位置。VPN、出差、跨国办公都会让它猜错，而且欧盟客户对
 *   IP 定位有额外说明义务。浏览器语言是用户自己设备上的声明，比 IP 可靠。
 */

export type Lang = 'zh' | 'en'

/** 支持的语言。加语言时这里和 strings.ts 一起改。 */
export const SUPPORTED: readonly Lang[] = ['zh', 'en'] as const

export const FALLBACK: Lang = 'en'

const USER_KEY = 'mfg.lang.user'
const CHANGE_EVENT = 'mfg.lang.changed'

function isSupported(value: string | null | undefined): value is Lang {
    return !!value && (SUPPORTED as readonly string[]).includes(value)
}

/** 用户手动选过的语言；没选过返回 null。 */
export function getUserLang(): Lang | null {
    try {
        const v = localStorage.getItem(USER_KEY)
        return isSupported(v) ? v : null
    } catch {
        // 隐私模式 / 存储被禁用 —— 当成"没选过"，不要因此让页面挂掉
        return null
    }
}

/** 记录用户的手动选择，并通知同一页面的订阅者。 */
export function setUserLang(lang: Lang): void {
    try {
        localStorage.setItem(USER_KEY, lang)
    } catch {
        // 存不了就算了：本次会话仍然是这个语言，只是下次打开会重新判断
    }
    window.dispatchEvent(new CustomEvent<Lang>(CHANGE_EVENT, { detail: lang }))
}

/** 浏览器首选语言里第一个我们能支持的。 */
export function browserLang(): Lang | null {
    if (typeof navigator === 'undefined') return null
    // navigator.languages 在部分浏览器（Safari / 无痕）里只有一个值，
    // 拿不到完整偏好列表 —— 这种情况就只判断这一个，够用了。
    const list = navigator.languages?.length ? navigator.languages : [navigator.language]
    for (const tag of list) {
        const base = tag.split('-')[0]?.toLowerCase()
        if (isSupported(base)) return base
    }
    return null
}

/**
 * 决定当前该用哪种语言。
 *
 * @param accountLocale 登录响应里的 locale；未登录传 null
 */
export function detect(accountLocale?: string | null): Lang {
    const manual = getUserLang()
    if (manual) return manual
    const fromAccount = accountLocale?.split('-')[0]?.toLowerCase()
    if (isSupported(fromAccount)) return fromAccount
    return browserLang() ?? FALLBACK
}

/** 订阅语言变化（同一标签页内）。返回取消订阅函数。 */
export function subscribeLang(listener: (lang: Lang) => void): () => void {
    const onCustom = (e: Event) => {
        const detail = (e as CustomEvent<Lang>).detail
        if (isSupported(detail)) listener(detail)
    }
    // 跨标签页：localStorage 的 storage 事件只会在【别的】标签页触发
    const onStorage = (e: StorageEvent) => {
        if (e.key === USER_KEY && isSupported(e.newValue)) listener(e.newValue)
    }
    window.addEventListener(CHANGE_EVENT, onCustom)
    window.addEventListener('storage', onStorage)
    return () => {
        window.removeEventListener(CHANGE_EVENT, onCustom)
        window.removeEventListener('storage', onStorage)
    }
}
