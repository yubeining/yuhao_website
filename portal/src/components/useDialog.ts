/**
 * 三种浮层（Modal / ConfirmDialog / FilePreviewModal）共用的对话框行为。
 *
 * ★ 打开时焦点移进弹框（第一个可聚焦元素，没有就弹框本身），Tab 只在弹框里循环，
 *   关闭后焦点回到打开它的那个按钮 —— 以前焦点留在背后的页面上，键盘用户 Tab 一下就跑到遮罩后面去了。
 * ★ Esc 只关最上面那一层。以前每个浮层各自在 document 上监听 Esc，两层叠起来按一次全关。
 * ★ 锁背景滚动：第一个浮层打开时锁，最后一个关闭时还原（ConfirmDialog 以前不锁）。
 */

import { useEffect, useId, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'

/** 当前打开的浮层，最后一个在最上面。 */
const stack: symbol[] = []
let savedOverflow = ''

export function useDialog(onEscape: () => void) {
    const ref = useRef<HTMLDivElement>(null)
    const titleId = useId()
    // 调用方每次渲染都会传新的函数；用 ref 拿最新的，effect 只在打开 / 关闭时跑一次
    const escRef = useRef(onEscape)
    escRef.current = onEscape

    useEffect(() => {
        const me = Symbol('dialog')
        if (stack.length === 0) {
            savedOverflow = document.body.style.overflow
            document.body.style.overflow = 'hidden'
        }
        stack.push(me)
        const opener = document.activeElement as HTMLElement | null

        const focusables = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
            .filter((el) => el.offsetParent !== null)
        ;(focusables()[0] ?? ref.current)?.focus()

        const onKey = (e: KeyboardEvent) => {
            if (stack[stack.length - 1] !== me) return
            if (e.key === 'Escape') {
                e.preventDefault()
                escRef.current()
                return
            }
            if (e.key !== 'Tab') return
            const list = focusables()
            if (list.length === 0) { e.preventDefault(); return }
            const first = list[0]
            const last = list[list.length - 1]
            const active = document.activeElement
            const inside = ref.current?.contains(active)
            if (e.shiftKey && (active === first || !inside)) { e.preventDefault(); last.focus() }
            else if (!e.shiftKey && (active === last || !inside)) { e.preventDefault(); first.focus() }
        }
        document.addEventListener('keydown', onKey)

        return () => {
            document.removeEventListener('keydown', onKey)
            stack.splice(stack.indexOf(me), 1)
            if (stack.length === 0) document.body.style.overflow = savedOverflow
            // 打开它的按钮可能已经随列表刷新被卸载了，那就不归还
            if (opener && document.contains(opener)) opener.focus()
        }
    }, [])

    return { ref, titleId }
}
