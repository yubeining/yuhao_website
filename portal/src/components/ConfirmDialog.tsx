/**
 * 破坏性/不可逆动作的确认弹层。
 *
 * ★ 用在「提交订单」这种锁版本的动作用上：后果必须在点之前说清楚，
 *   而不是提交完再挂一条 banner 告诉用户"已经不能改了"。
 * ★ Esc / 点遮罩 = 取消；确认按钮在 busy 时禁用，避免重复提交。
 * ★ 页面里不要用 window.confirm —— 一律走这里（或下面的 useConfirm）。
 *   原生弹框按钮是浏览器语言、样式改不了，而且有的浏览器（内嵌 WebView、
 *   部分 App 内置浏览器）直接把它禁掉并返回 false，按钮点了就像没反应。
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n/I18nProvider'

export function ConfirmDialog({ title, message, confirmLabel, busy, danger, onConfirm, onCancel }: {
    /** 不填时只显示 message —— 文案本身已经是问句的场景 */
    title?: string
    message: string
    confirmLabel: string
    busy?: boolean
    /** 停用、撤销、拒接、删除这类动作：确认按钮用警示色 */
    danger?: boolean
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
                {title && <div className="dlg-h">{title}</div>}
                <div className="dlg-b" style={title ? undefined : { paddingTop: 18 }}>{message}</div>
                <div className="dlg-f">
                    <button className="btn" type="button" disabled={busy} onClick={onCancel}>
                        {t.common.cancel}
                    </button>
                    <button className={`btn pri${danger ? ' danger' : ''}`} type="button" disabled={busy} onClick={onConfirm}>
                        {busy ? '…' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}

/**
 * 替代 window.confirm 的命令式写法：`const [askConfirm, confirmDialog] = useConfirm()` → `if (!(await askConfirm(msg))) return`。
 * 返回的 dialog 节点必须渲染在页面里（放在 return 的最后即可）。
 */
export function useConfirm(): [(message: string, opts?: { danger?: boolean }) => Promise<boolean>, ReactNode] {
    const { t } = useI18n()
    const [req, setReq] = useState<{ message: string; danger: boolean; resolve: (ok: boolean) => void } | null>(null)

    const confirm = useCallback((message: string, opts?: { danger?: boolean }) =>
        new Promise<boolean>((resolve) => setReq({ message, danger: !!opts?.danger, resolve })), [])

    const close = (ok: boolean) => {
        req?.resolve(ok)
        setReq(null)
    }

    const dialog = req
        ? <ConfirmDialog message={req.message} confirmLabel={t.common.ok} danger={req.danger}
            onConfirm={() => close(true)} onCancel={() => close(false)} />
        : null

    return [confirm, dialog]
}
