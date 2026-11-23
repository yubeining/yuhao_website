import { useEffect, useState } from 'react'

/**
 * 「重新发送（N 秒）」的倒计时：设成 N 后每秒减一，减到 0 停。
 * 用法和 useState 一样：`const [left, setLeft] = useCountdown()`，发码成功后 `setLeft(60)`。
 */
export function useCountdown() {
    const [left, setLeft] = useState(0)

    useEffect(() => {
        if (left <= 0) return
        const id = window.setTimeout(() => setLeft((n) => n - 1), 1000)
        return () => window.clearTimeout(id)
    }, [left])

    return [left, setLeft] as const
}
