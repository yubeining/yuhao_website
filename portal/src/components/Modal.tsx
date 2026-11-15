/**
 * 居中弹框 —— 全站编辑统一走这里：只读展示 → 「编辑」→ 弹框 → 取消 / 保存。
 *
 * ★ 弹框只放这次要改的那几个字段，宽度窄（默认 360，单值 320），不铺满屏幕。
 * ★ 打开时锁滚动；点遮罩 / Esc 关闭；busy 时不许关、不许重复提交。
 * ★ 标题、底部动作由调用方给。
 */

import { useEffect, type ReactNode } from 'react'

export function Modal({ title, onClose, footer, children, busy, width = 360 }: {
    title: string
    onClose: () => void
    footer?: ReactNode
    children: ReactNode
    busy?: boolean
    /** 单值编辑 320，带两三个字段 360~400 */
    width?: number
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !busy) onClose()
        }
        document.addEventListener('keydown', onKey)
        document.body.style.overflow = 'hidden'
        return () => {
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = ''
        }
    }, [busy, onClose])

    return (
        <div className="modal-mask" onClick={() => { if (!busy) onClose() }}>
            <div className="modal" style={{ width }} onClick={(e) => e.stopPropagation()}
                role="dialog" aria-modal="true">
                <div className="modal-h">{title}</div>
                <div className="modal-b">{children}</div>
                {footer && <div className="modal-f">{footer}</div>}
            </div>
        </div>
    )
}
