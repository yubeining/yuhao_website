/**
 * 报价工作台里的「发货」块（2026-11-24 需求方拍板）：订单全部完工（待发货）之后出现。
 *
 * ★ 整单一次发给客户：点「发货给客户」→ 弹框填承运商（自由文本，三方运输公司还没定）+ 运单号，两个都必填。
 *   发货不能撤回，弹框里点确认就是确认，不再追加一层确认。
 * ★ 随货文件（质检报告 / 材质证明，不分类）：待发货、已发货时都能传，客户确认收货后不能再传。
 *   只收 PDF / JPG / PNG，后端按文件内容判，不对会拒。
 * ★ 发货信息只显示后端给的字段；还没发货就不显示这一块信息，不占位。
 */

import { useRef, useState } from 'react'
import { Field, Input } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Banner, Card, CardBody, CardHead, Fields, Fld, TableWrap } from '../../components/ui'
import { useBusy } from '../../components/useBusy'
import { errorText } from '../../i18n/errorText'
import { useI18n } from '../../i18n/I18nProvider'
import { fmtDateTime, X } from '../../lib/format'
import {
    opsOrderDocumentViewUrl, shipOrder, uploadOrderDocument, type OpsOrderView,
} from '../../services'

export function ShippingCard({ order, onChanged }: { order: OpsOrderView; onChanged: () => Promise<void> }) {
    const { t } = useI18n()
    const s = t.shipping
    const [err, setErr] = useState<string | null>(null)
    const { busy, run } = useBusy((e) => setErr(errorText(t, e)))
    const [shipping, setShipping] = useState(false)
    const [carrier, setCarrier] = useState('')
    const [trackingNo, setTrackingNo] = useState('')
    const [tried, setTried] = useState(false)
    const fileInput = useRef<HTMLInputElement>(null)

    const canShip = order.status === 'READY'
    const docsOpen = order.status === 'READY' || order.status === 'SHIPPED'
    const missing = !carrier.trim() || !trackingNo.trim()

    const submitShip = () => {
        setTried(true)
        if (missing) return
        void run(async () => {
            await shipOrder(order.id, carrier.trim(), trackingNo.trim())
            setShipping(false)
            setErr(null)
            await onChanged()
        })
    }

    const upload = (files: FileList | null) => {
        const file = files?.[0]
        if (!file) return
        void run(async () => {
            await uploadOrderDocument(order.id, file)
            setErr(null)
            await onChanged()
        })
        if (fileInput.current) fileInput.current.value = ''
    }

    const download = (documentId: string) => run(async () => {
        window.location.assign((await opsOrderDocumentViewUrl(order.id, documentId)).url)
    })

    return (
        <Card style={{ marginBottom: 16 }}>
            <CardHead title={s.title} right={canShip
                ? <button className="btn pri sm" type="button" disabled={busy}
                    onClick={() => { setShipping(true); setTried(false) }}>{s.shipBtn}</button>
                : undefined} />
            {err && <Banner tone="wa" style={{ margin: 12 }}>{err}</Banner>}
            {order.shipment && (
                <CardBody>
                    <Fields>
                        <Fld k={s.carrier} v={order.shipment.carrier} />
                        <Fld k={s.trackingNo} v={order.shipment.trackingNo} mono />
                        <Fld k={s.shippedAt} v={fmtDateTime(new Date(order.shipment.shippedAt))} mono />
                        <Fld k={s.receivedAt} v={order.shipment.receivedAt ? fmtDateTime(new Date(order.shipment.receivedAt)) : X} mono />
                    </Fields>
                </CardBody>
            )}
            <CardHead title={s.docsTitle} right={docsOpen ? (
                <>
                    <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
                        onChange={(e) => upload(e.target.files)} />
                    <button className="btn sm" type="button" disabled={busy}
                        onClick={() => fileInput.current?.click()}>{busy ? s.uploading : s.upload}</button>
                </>
            ) : undefined} />
            {order.documents.length ? (
                <CardBody flush>
                    <TableWrap>
                        <tbody>
                            {order.documents.map((d) => (
                                <tr key={d.id}>
                                    <td className="t1">{d.originalFilename}</td>
                                    <td className="n">{d.completedAt ? fmtDateTime(new Date(d.completedAt)) : X}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button className="btn qui sm" type="button" disabled={busy}
                                            onClick={() => void download(d.id)}>{s.download}</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableWrap>
                </CardBody>
            ) : (
                <CardBody><span className="t2">{docsOpen ? s.docsHint : s.docsEmpty}</span></CardBody>
            )}

            {shipping && (
                <Modal title={s.shipModalTitle} busy={busy} width={380} onClose={() => setShipping(false)}
                    footer={
                        <>
                            <button className="btn" type="button" disabled={busy} onClick={() => setShipping(false)}>{t.common.cancel}</button>
                            <button className="btn pri" type="button" disabled={busy} onClick={submitShip}>{s.shipSubmit}</button>
                        </>
                    }>
                    <Field label={s.carrier} required>
                        <Input value={carrier} onChange={setCarrier} bad={tried && !carrier.trim()} />
                    </Field>
                    <Field label={s.trackingNo} required>
                        <Input value={trackingNo} onChange={setTrackingNo} bad={tried && !trackingNo.trim()} onEnter={submitShip} />
                    </Field>
                    {tried && missing && <div className="errmsg">{s.needBoth}</div>}
                </Modal>
            )}
        </Card>
    )
}
