/**
 * 我的订单 —— 接下的单（含已取消的）、价格（接单时锁定）、看图、退单（2026-09-18 拍板）。
 *
 * ★ 签合同之前可以退单：退单后这张单回到平台重派。合同 / 签字下一步做，所以现在都能退。
 * ★ 价格是接单那一刻按你的折率锁定的，之后平台改折率不影响。
 * ★ 以前这一页是原型（排产、报工进度都是演示数据），已换成真数据；生产进度等做到那一步再加。
 */

import { useCallback, useEffect, useState } from 'react'
import { Banner, Card, CardBody, CardFoot, CardHead, Empty, Fields, Fld, Hello, Page, pill, TableWrap } from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { fmtDateTime, M, X } from '../../mock/format'
import {
    listSupplierOrders, supplierOrderFileUrl, supplierOrderPrices, withdrawSupplierOrder,
    type OrderPrice, type SupplierOrderView,
} from '../../services'
import { CANCEL_REASON, shortId, SUPPLIER_ORDER_ST } from '../ops/dispatchStatus'

export function SupplierOrdersPage() {
    const { t } = useMock()
    const [orders, setOrders] = useState<SupplierOrderView[] | null>(null)
    const [prices, setPrices] = useState<Record<string, OrderPrice>>({})
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const load = useCallback(async () => {
        try {
            const [os, ps] = await Promise.all([listSupplierOrders(), supplierOrderPrices()])
            setPrices(Object.fromEntries(ps.map((p) => [p.supplierOrderId, p])))
            setOrders(os)
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])

    useEffect(() => { void load() }, [load])

    const withdraw = (o: SupplierOrderView) => {
        if (!window.confirm('退掉这张单？退单后平台会重新派给别人。')) return
        setBusy(true)
        withdrawSupplierOrder(o.id)
            .then(() => load())
            .catch((e) => setErr(errorText(t, e)))
            .finally(() => setBusy(false))
    }

    const view = (orderId: string, lineId: string, fileId: string) => {
        supplierOrderFileUrl(orderId, lineId, fileId)
            .then((u) => window.location.assign(u.url))
            .catch((e) => setErr(errorText(t, e)))
    }

    return (
        <Page>
            <Hello title="我的订单" />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {orders === null ? (
                <Card><CardBody><Empty text="加载中…" /></CardBody></Card>
            ) : orders.length === 0 ? (
                <Card><CardBody><Empty text="还没有接过单" sub="在「订单市场」接单后会出现在这里" /></CardBody></Card>
            ) : orders.map((o) => {
                const p = prices[o.id]
                const lp = (lineId: string) => p?.lines.find((l) => l.lineId === lineId)
                return (
                    <Card key={o.id} style={{ marginBottom: 16 }}>
                        <CardHead title={`订单 ${shortId(o.id)}`} right={pill(SUPPLIER_ORDER_ST[o.status])} />
                        <CardBody>
                            <Fields>
                                <Fld k="交期" v={o.supplierDueDate} mono />
                                <Fld k="合计" v={p ? `¥ ${M(p.total)}` : X} mono />
                                <Fld k="接单时间" v={fmtDateTime(new Date(o.acceptedAt))} mono />
                                {o.status === 'CANCELLED' && (
                                    <Fld k="取消" v={`${o.cancelReason ? CANCEL_REASON[o.cancelReason] : X} · ${o.cancelledAt ? fmtDateTime(new Date(o.cancelledAt)) : X}`} />
                                )}
                            </Fields>
                        </CardBody>
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr><th>图号</th><th>名称</th><th>材料 / 表面处理</th><th className="n">数量</th><th className="n">单价 ¥</th><th className="n">小计 ¥</th><th>图纸</th></tr>
                                </thead>
                                <tbody>
                                    {o.lines.map((l) => (
                                        <tr key={l.id}>
                                            <td className="m">{l.code}</td>
                                            <td className="t1">{l.partName}</td>
                                            <td>{l.material || X}<div className="t2">{l.surfaceTreatment || X}</div></td>
                                            <td className="n">{l.quantity}</td>
                                            <td className="n">{lp(l.id) ? M(lp(l.id)!.unitPriceCny) : X}</td>
                                            <td className="n">{lp(l.id) ? M(lp(l.id)!.lineTotalCny) : X}</td>
                                            <td>
                                                {o.status === 'ACCEPTED' && l.files.length ? l.files.map((f) => (
                                                    <div key={f.id}>
                                                        <button className="btn qui sm" type="button" onClick={() => view(o.id, l.id, f.id)}>{f.originalFilename}</button>
                                                    </div>
                                                )) : X}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        </CardBody>
                        {o.status === 'ACCEPTED' && (
                            <CardFoot
                                left={<span className="t2">签合同之前可以退单；合同 / 签字下一步上线。</span>}
                                right={<button className="btn" type="button" disabled={busy} onClick={() => withdraw(o)}>退单</button>}
                            />
                        )}
                    </Card>
                )
            })}
        </Page>
    )
}
