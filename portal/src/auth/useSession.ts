import { useSyncExternalStore } from 'react'
import { getSession, subscribeSession, type Session } from './session'

/**
 * 订阅登录态。
 *
 * ★ 用 useSyncExternalStore 而不是 useState + useEffect：
 *   登录态存在 React 之外（localStorage），useState 的写法会在
 *   「首屏渲染」和「effect 跑完」之间有一帧拿到旧值 —— 表现为
 *   刷新页面时闪一下登录页再跳回来。useSyncExternalStore 没有这个中间态。
 *
 * ★ getSnapshot 必须返回稳定引用，否则 React 会判定每次都变了并无限重渲染。
 *   这里缓存上一次的 JSON 字符串来比对。
 */
let cachedRaw: string | null = null
let cachedSession: Session | null = null

function getSnapshot(): Session | null {
    const raw = localStorage.getItem('mfg.session')
    if (raw !== cachedRaw) {
        cachedRaw = raw
        cachedSession = getSession()
    }
    return cachedSession
}

export function useSession(): Session | null {
    return useSyncExternalStore(subscribeSession, getSnapshot, () => null)
}
