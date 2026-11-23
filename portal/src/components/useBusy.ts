import { useState } from 'react'

/**
 * 按钮动作的忙碌状态：调接口期间 busy=true（按钮置灰），出错交给 onError。
 *
 * ★ 只管「忙 / 出错」这层壳。成功之后做什么（清掉旧错误、提示、重新加载）各页不一样，
 *   写在传给 run 的函数里 —— 以前每页各抄一份 setBusy / try / catch / finally，七份长得几乎一样。
 */
export function useBusy(onError: (e: unknown) => unknown) {
    const [busy, setBusy] = useState(false)

    const run = async (fn: () => Promise<unknown>) => {
        setBusy(true)
        try {
            await fn()
        } catch (e) {
            await onError(e)
        } finally {
            setBusy(false)
        }
    }

    return { busy, setBusy, run }
}
