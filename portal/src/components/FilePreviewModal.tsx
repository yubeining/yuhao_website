/**
 * 图纸预览弹层。
 *
 * ★ 只有浏览器原生能渲染的格式才给预览入口：PDF 用 iframe（内置查看器）、
 *   图片用 img。STEP / DWG / DXF / SLDPRT 浏览器渲染不了，界面上不给一个点了没反应的按钮。
 * ★ iframe 指向对象存储的**签名 inline URL**；CSP 里 `frame-src` 只放行存储域。
 * ★ 按 Esc 或点遮罩关闭。
 */

import { useEffect } from 'react'
import { useI18n } from '../i18n/I18nProvider'

export type PreviewKind = 'pdf' | 'image'

export function FilePreviewModal({ name, url, kind, onClose, onDownload }: {
    name: string
    url: string
    kind: PreviewKind
    onClose: () => void
    onDownload: () => void
}) {
    const { t } = useI18n()
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    return (
        <div className="fp-overlay" onClick={onClose}>
            <div className="fp-modal" onClick={(e) => e.stopPropagation()}>
                <div className="fp-head">
                    <span className="fp-title" title={name}>{name}</span>
                    <button className="btn sm" type="button" onClick={onDownload}>{t.customer.partForm.download}</button>
                    <button className="btn sm qui" type="button" onClick={onClose}>{t.common.close}</button>
                </div>
                <div className="fp-body">
                    {kind === 'pdf'
                        ? <iframe src={url} title={name} className="fp-frame" />
                        : <img src={url} alt={name} className="fp-img" />}
                </div>
            </div>
        </div>
    )
}

/** 能在线预览的扩展名。其余一律只给下载。 */
const PREVIEWABLE: Record<string, PreviewKind> = {
    PDF: 'pdf',
    PNG: 'image', JPG: 'image', JPEG: 'image', WEBP: 'image', GIF: 'image',
}

export function previewKindOf(filename: string): PreviewKind | null {
    const dot = filename.lastIndexOf('.')
    if (dot < 0) return null
    return PREVIEWABLE[filename.slice(dot + 1).toUpperCase()] ?? null
}
