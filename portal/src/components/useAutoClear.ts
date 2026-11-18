/**
 * 成功提示显示 2 秒后自己消失（CLAUDE.md §10 C7：反馈不留常驻横幅）。
 * 错误提示不用它 —— 出错的信息要留着给人看。
 */

import { useEffect } from 'react'

export function useAutoClear(value: string | null, clear: () => void, ms = 2000) {
    useEffect(() => {
        if (!value) return
        const id = window.setTimeout(clear, ms)
        return () => window.clearTimeout(id)
        // clear 每次渲染都是新函数，不放进依赖：只在提示内容变化时重新计时
    }, [value, ms])
}
