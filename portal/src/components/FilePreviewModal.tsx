/**
 * 图纸预览弹层。
 *
 * ★ 只有浏览器原生能渲染的格式才给预览入口：PDF 用 iframe（内置查看器）、
 *   图片用 img。STEP / DWG / DXF / SLDPRT 浏览器渲染不了，界面上不给一个点了没反应的按钮。
 * ★ iframe 指向对象存储的**签名 inline URL**；CSP 里 `frame-src` 只放行存储域。
 * ★ 按 Esc 或点遮罩关闭；焦点管理、Esc 只关最上层、锁滚动见 useDialog。
 */

import { useI18n } from '../i18n/I18nProvider'
import { useDialog } from './useDialog'

export type PreviewKind = 'pdf' | 'image'

export function FilePreviewModal({ name, url, kind, onClose, onDownload }: {
    name: string
    url: string
    kind: PreviewKind
    onClose: () => void
    onDownload: () => void
}) {
    const { t } = useI18n()
    const { ref, titleId } = useDialog(onClose)

    return (
        <div className="fp-overlay" onClick={onClose}>
            <div className="fp-modal" onClick={(e) => e.stopPropagation()}
                role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
                <div className="fp-head">
                    <span className="fp-title" id={titleId} title={name}>{name}</span>
                    <a className="btn sm qui" href={url} target="_blank" rel="noreferrer">{t.common.openInNewTab}</a>
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
