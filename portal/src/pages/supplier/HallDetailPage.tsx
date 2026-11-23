/**
 * 单子详情 —— 看零件、图纸、对供价、交期，接单或不接（2026-09-18 拍板）。
 *
 * ★ 先到先得：点「接单」时如果已经被别人接走 / 被平台收回，会提示，不会重复接。
 * ★ 定向派给你的可以点「不接」，只把你移出，别的被派到的供应商照常可接；全市场的单不接就行，没有「不接」按钮。
 * ★ 看图每次都记录（审计）。接单后签合同之前双方都可以退（在「我的订单」里退单）。
 */

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Empty, Fields, Fld, Hello, Page, Pending, pill, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useI18n } from '../../i18n/I18nProvider'
import { fmtDateTime, M, X } from '../../lib/format'
import { FilePreviewModal, previewKindOf, type PreviewKind } from '../../components/FilePreviewModal'
import {
    acceptSupplierOffer, ApiError, declineSupplierOffer, getSupplierOffer, supplierOfferFilePreviewUrl,
    supplierOfferFileUrl, supplierOfferPrices, type OfferPrice, type SupplierOffer,
} from '../../services'
import { useConfirm } from '../../components/ConfirmDialog'

export function HallDetailPage() {
    const { t } = useI18n()
    const [askConfirm, confirmDialog] = useConfirm()
    const navigate = useNavigate()
    const { id = '' } = useParams()
    const [offer, setOffer] = useState<SupplierOffer | null>(null)
    const [price, setPrice] = useState<OfferPrice | null>(null)
    const [missing, setMissing] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [preview, setPreview] = useState<{ name: string; url: string; kind: PreviewKind; lineId: string; fileId: string } | null>(null)

    const load = useCallback(async () => {
        try {
            setOffer(await getSupplierOffer(id))
            setPrice((await supplierOfferPrices([id]))[0] ?? null)
        } catch (e) {
            if (e instanceof ApiError && (e.code === 404 || e.code === 400)) setMissing(true)
            else setErr(errorText(t, e))
        }
    }, [id, t])

    useEffect(() => { void load() }, [load])

    const back = <Link className="btn sm qui" to="/supplier/hall" style={{ margin: '0 0 6px -9px' }}>{t.supplier.hallDetail.back}</Link>

    if (missing) {
        return (
            <Page><Hello back={back} title={t.supplier.hallDetail.title} /><Card><CardBody>
                <Empty text={t.supplier.hallDetail.gone} sub={t.supplier.hallDetail.goneSub} />
            </CardBody></Card></Page>
        )
    }
    if (!offer) {
        return <Page><Card><CardBody><Pending err={err} onRetry={() => void load()} back={back} /></CardBody></Card></Page>
    }

    const priceOf = (lineId: string) => price?.lines.find((l) => l.lineId === lineId)
    const targeted = offer.dispatchMode === 'TARGETED'

    const accept = async () => {
        if (!(await askConfirm(t.supplier.hallDetail.acceptConfirm(price ? M(price.total) : X, offer.supplierDueDate)))) return
        setBusy(true)
        acceptSupplierOffer(offer.id)
            .then(() => navigate('/supplier/orders', { replace: true }))
            .catch((e) => setErr(errorText(t, e)))
            .finally(() => setBusy(false))
    }

    const decline = async () => {
        if (!(await askConfirm(t.supplier.hallDetail.declineConfirm, { danger: true }))) return
        setBusy(true)
        declineSupplierOffer(offer.id)
            .then(() => navigate('/supplier/hall', { replace: true }))
            .catch((e) => setErr(errorText(t, e)))
            .finally(() => setBusy(false))
    }

    /** 看图是预览，不是下载；弹层里的「下载」才用带 attachment 的 URL。 */
    const openPreview = (lineId: string, name: string, fileId: string) => {
        const kind = previewKindOf(name)
        if (!kind) return
        supplierOfferFilePreviewUrl(offer.id, lineId, fileId)
            .then((u) => setPreview({ name, url: u.url, kind, lineId, fileId }))
            .catch((e) => setErr(errorText(t, e)))
    }

    const download = (lineId: string, fileId: string) => {
        supplierOfferFileUrl(offer.id, lineId, fileId)
            .then((u) => window.location.assign(u.url))
            .catch((e) => setErr(errorText(t, e)))
    }

    return (
        <Page>
            <Hello back={back} title={t.supplier.hallDetail.title} right={targeted ? pill(['in', t.supplier.hall.targeted]) : pill(['ne', t.supplier.hall.openMarket])} />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            <Card style={{ marginBottom: 16 }}>
                <CardHead title={t.supplier.hallDetail.summaryTitle} />
                <CardBody>
                    <Fields>
                        <Fld k={t.supplier.hallDetail.fldDue} v={offer.supplierDueDate} mono />
                        <Fld k={t.supplier.hallDetail.fldTotal} v={price ? `¥ ${M(price.total)}` : X} mono />
                        <Fld k={t.supplier.hallDetail.fldDispatched} v={fmtDateTime(new Date(offer.dispatchedAt))} mono />
                    </Fields>
                    <div className="t2" style={{ marginTop: 8 }}>{t.supplier.hallDetail.note}</div>
                </CardBody>
            </Card>
            <Card>
                <CardHead title={t.supplier.hallDetail.partsTitle(offer.lines.length)} />
                <CardBody flush>
                    {/* stack：窄屏下每行变成一张竖排卡片（td 前面显示 data-label），桌面端不变 */}
                            <TableWrap className="stack">
                        <thead>
                            <tr>
                                <th>{t.customer.orderDetail.colCode}</th><th>{t.common.table.name}</th><th>{t.supplier.hallDetail.colMaterialSurface}</th><th className="n">{t.customer.quotes.colQty}</th>
                                <th className="n">{t.supplier.hallDetail.colUnitPrice}</th><th className="n">{t.supplier.hallDetail.colSubtotal}</th><th>{t.supplier.hallDetail.colDrawing}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {offer.lines.map((l) => (
                                <tr key={l.id}>
                                    <td data-label={t.customer.orderDetail.colCode} className="m">{l.code}</td>
                                    <td data-label={t.common.table.name} className="t1">{l.partName}</td>
                                    <td data-label={t.supplier.hallDetail.colMaterialSurface}>{l.material || X}<div className="t2">{l.surfaceTreatment || X}</div></td>
                                    <td data-label={t.customer.quotes.colQty} className="n">{l.quantity}</td>
                                    <td data-label={t.supplier.hallDetail.colUnitPrice} className="n">{priceOf(l.id) ? M(priceOf(l.id)!.unitPriceCny) : X}</td>
                                    <td data-label={t.supplier.hallDetail.colSubtotal} className="n">{priceOf(l.id) ? M(priceOf(l.id)!.lineTotalCny) : X}</td>
                                    <td data-label={t.supplier.hallDetail.colDrawing}>
                                        {l.files.length ? l.files.map((f) => (
                                            <div key={f.id}>
                                                {/* 能预览的（PDF / 图片）开预览；CAD 等格式浏览器渲染不了，点了直接下载 */}
                                                <button className="btn qui sm" type="button"
                                                    title={previewKindOf(f.originalFilename) ? undefined : t.customer.partForm.previewUnsupported}
                                                    onClick={() => previewKindOf(f.originalFilename)
                                                        ? openPreview(l.id, f.originalFilename, f.id)
                                                        : download(l.id, f.id)}>
                                                    {f.originalFilename}
                                                </button>
                                            </div>
                                        )) : X}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableWrap>
                </CardBody>
                <CardFoot
                    left={targeted ? <button className="btn" type="button" disabled={busy} onClick={decline}>{t.supplier.hallDetail.decline}</button> : undefined}
                    right={<button className="btn pri" type="button" disabled={busy} onClick={accept}>{t.supplier.hallDetail.accept}</button>}
                />
            </Card>
            {preview && (
                <FilePreviewModal name={preview.name} url={preview.url} kind={preview.kind}
                    onClose={() => setPreview(null)}
                    onDownload={() => download(preview.lineId, preview.fileId)} />
            )}
            {confirmDialog}
        </Page>
    )
}
