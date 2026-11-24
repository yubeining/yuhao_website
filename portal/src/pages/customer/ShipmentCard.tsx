/**
 * 客户订单详情里的「发货」块（2026-11-24）：运营发货之后出现 —— 承运商、运单号、发货时间、确认收货时间，
 * 以及运营传的随货文件（质检报告 / 材质证明）。
 *
 * ★ 还没发货、也没有随货文件时整块不显示（C5：没有内容不占位）。
 * ★ 物流轨迹不查（2026-11-24：三方运输公司还没定），只给单号。
 */

import { useState } from 'react'
import { Banner, Card, CardBody, CardHead, Fields, Fld, TableWrap } from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useI18n } from '../../i18n/I18nProvider'
import { fmtDateTime, X } from '../../lib/format'
import { orderDocumentViewUrl, type OrderView } from '../../services'

export function ShipmentCard({ order }: { order: OrderView }) {
    const { t } = useI18n()
    const s = t.shipping
    const [err, setErr] = useState<string | null>(null)

    if (!order.shipment && order.documents.length === 0) return null

    const download = (documentId: string) => {
        orderDocumentViewUrl(order.id, documentId)
            .then((u) => window.location.assign(u.url))
            .catch((e) => setErr(errorText(t, e)))
    }

    return (
        <Card style={{ marginBottom: 16 }}>
            <CardHead title={s.title} />
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
            {order.documents.length > 0 && (
                <>
                    <CardHead title={s.docsTitle} />
                    <CardBody flush>
                        <TableWrap>
                            <tbody>
                                {order.documents.map((d) => (
                                    <tr key={d.id}>
                                        <td className="t1">{d.originalFilename}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button className="btn qui sm" type="button" onClick={() => download(d.id)}>{s.download}</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                </>
            )}
        </Card>
    )
}
