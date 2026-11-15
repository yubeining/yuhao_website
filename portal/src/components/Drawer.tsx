/**
 * 右侧抽屉 —— 账号管理的新建 / 编辑表单放这里，不再插进列表中间把页面挤乱。
 *
 * ★ 打开时锁定滚动、点遮罩 / Esc 关闭。
 * ★ 标题、内容、底部动作由调用方给；busy 时禁用提交避免重复。
 */

import { useEffect } from 'react'
import { useI18n } from '../i18n/I18nProvider'

export function Drawer({ title, onClose, footer, children, busy }: {
    title: string
    onClose: () => void
    footer: React.ReactNode
    children: React.ReactNode
    busy?: boolean
}) {
    const { t } = useI18n()

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
        <div className="drawer-mask" onClick={() => { if (!busy) onClose() }}>
            <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="drawer-h">
                    <span className="drawer-title">{title}</span>
                    <button className="btn qui sm" type="button" onClick={onClose}>{t.common.close}</button>
                </div>
                <div className="drawer-b">{children}</div>
                {footer && <div className="drawer-f">{footer}</div>}
            </aside>
        </div>
    )
}
