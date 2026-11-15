/**
 * 破坏性/不可逆动作的确认弹层。
 *
 * ★ 用在「提交订单」这种锁版本的动作用上：后果必须在点之前说清楚，
 *   而不是提交完再挂一条 banner 告诉用户"已经不能改了"。
 * ★ Esc / 点遮罩 = 取消；确认按钮在 busy 时禁用，避免重复提交。
 */

import { useEffect } from 'react'
import { useI18n } from '../i18n/I18nProvider'

export function ConfirmDialog({ title, message, confirmLabel, busy, onConfirm, onCancel }: {
    title: string
    message: string
    confirmLabel: string
    busy?: boolean
    onConfirm: () => void
    onCancel: () => void
}) {
    const { t } = useI18n()

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !busy) onCancel()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [busy, onCancel])

    return (
        <div className="fp-overlay" onClick={() => { if (!busy) onCancel() }}>
            <div className="dlg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="dlg-h">{title}</div>
                <div className="dlg-b">{message}</div>
                <div className="dlg-f">
                    <button className="btn" type="button" disabled={busy} onClick={onCancel}>
                        {t.common.cancel}
                    </button>
                    <button className="btn pri" type="button" disabled={busy} onClick={onConfirm}>
                        {busy ? '…' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
