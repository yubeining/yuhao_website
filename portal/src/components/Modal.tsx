/**
 * 居中弹框 —— 全站编辑统一走这里：只读展示 → 「编辑」→ 弹框 → 取消 / 保存。
 *
 * ★ 弹框只放这次要改的那几个字段，宽度窄（默认 360，单值 320），不铺满屏幕。
 * ★ 焦点进弹框、Tab 不出框、Esc 只关最上层、锁背景滚动 —— 见 useDialog。
 *   点遮罩 / Esc 关闭；busy 时不许关、不许重复提交。
 * ★ 标题、底部动作由调用方给。
 */

import type { ReactNode } from 'react'
import { useDialog } from './useDialog'

export function Modal({ title, onClose, footer, children, busy, width = 360 }: {
    title: string
    onClose: () => void
    footer?: ReactNode
    children: ReactNode
    busy?: boolean
    /** 单值编辑 320，带两三个字段 360~400 */
    width?: number
}) {
    const { ref, titleId } = useDialog(() => { if (!busy) onClose() })

    return (
        <div className="modal-mask" onClick={() => { if (!busy) onClose() }}>
            <div className="modal" style={{ width }} onClick={(e) => e.stopPropagation()}
                role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
                <div className="modal-h" id={titleId}>{title}</div>
                <div className="modal-b">{children}</div>
                {footer && <div className="modal-f">{footer}</div>}
            </div>
        </div>
    )
}
