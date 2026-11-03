/**
 * 我的订单 —— 接下的单（含已取消的）、价格（接单时锁定）、看图、退单（2026-09-18 拍板）。
 *
 * ★ 合同（2026-09-20）：平台建好合同后这里出现「签字」按钮。本轮没有 PDF、没有条款正文，签的就是页面上这些内容。
 * ★ **接单后 7 天内要签字**，到点没签系统自动取消、单子回平台重派。页面上写明期限。
 * ★ 签字前可以退单；签完锁定，退不了也改不了。
 * ★ 价格是接单那一刻按你的折率锁定的，之后平台改折率不影响。
 * ★ 生产（2026-09-20）：签完字之后每一行有「开工」「完工」两个动作 —— **只报这两个，不报件数**。
 *   整单全部完工才能「发给平台」。质检判返工 / 重做的行会以新行出现在这张单里，做完再发一次。
 */

import { useCallback, useEffect, useState } from 'react'
import { Banner, Card, CardBody, CardFoot, CardHead, Empty, Fields, Fld, Hello, Page, pill, TableWrap } from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { fmtDateTime, M, X } from '../../mock/format'
import {
    listSupplierOrders, producedSupplierLine, shipSupplierOrder, signSupplierOrder, startSupplierLine,
    supplierOrderFileUrl, supplierOrderPrices, withdrawSupplierOrder,
    type OrderPrice, type SupplierOrderView,
} from '../../services'
import { cancelReason, lineSt, shortId, supplierOrderSt } from '../ops/dispatchStatus'

/** 签完字之后才谈得上生产；取消的单什么都不做。 */
const IN_PRODUCTION_FLOW = ['CONTRACTED', 'IN_PRODUCTION', 'SHIPPED', 'FULFILLED']

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

    const sign = (o: SupplierOrderView) => {
        if (!window.confirm(t.supplier.orders.waitingSignConfirm(M(prices[o.id]?.total ?? 0), o.supplierDueDate))) return
        setBusy(true)
        signSupplierOrder(o.id)
            .then(() => load())
            .catch((e) => setErr(errorText(t, e)))
            .finally(() => setBusy(false))
    }

    const withdraw = (o: SupplierOrderView) => {
        if (!window.confirm(t.supplier.orders.withdrawConfirm)) return
        setBusy(true)
        withdrawSupplierOrder(o.id)
            .then(() => load())
            .catch((e) => setErr(errorText(t, e)))
            .finally(() => setBusy(false))
    }

    /** 开工 / 完工 / 发货三个动作长得一样，只有调的接口不同。 */
    const act = (run: () => Promise<unknown>) => {
        setBusy(true)
        run()
            .then(() => load())
            .catch((e) => setErr(errorText(t, e)))
            .finally(() => setBusy(false))
    }

    const ship = (o: SupplierOrderView) => {
        if (!window.confirm(t.supplier.orders.shipConfirm)) return
        act(() => shipSupplierOrder(o.id))
    }

    const view = (orderId: string, lineId: string, fileId: string) => {
        supplierOrderFileUrl(orderId, lineId, fileId)
            .then((u) => window.location.assign(u.url))
            .catch((e) => setErr(errorText(t, e)))
    }

    return (
        <Page>
            <Hello title={t.supplier.orders.title} />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {orders === null ? (
                <Card><CardBody><Empty text={t.common.loading} /></CardBody></Card>
            ) : orders.length === 0 ? (
                <Card><CardBody><Empty text={t.supplier.orders.empty} sub={t.supplier.orders.emptySub} /></CardBody></Card>
            ) : orders.map((o) => {
                const p = prices[o.id]
                const lp = (lineId: string) => p?.lines.find((l) => l.lineId === lineId)
                const inFlow = IN_PRODUCTION_FLOW.includes(o.status)
                const unfinished = o.lines.filter((l) => l.status === 'PENDING' || l.status === 'IN_PRODUCTION').length
                const readyToShip = o.lines.filter((l) => l.status === 'PRODUCED').length
                return (
                    <Card key={o.id} style={{ marginBottom: 16 }}>
                        <CardHead title={t.supplier.orders.cardTitle(shortId(o.id))} right={pill(supplierOrderSt(t)[o.status])} />
                        <CardBody>
                            <Fields>
                                <Fld k={t.supplier.orders.fldDue} v={o.supplierDueDate} mono />
                                <Fld k={t.supplier.orders.fldTotal} v={p ? `¥ ${M(p.total)}` : X} mono />
                                <Fld k={t.supplier.orders.fldAccepted} v={fmtDateTime(new Date(o.acceptedAt))} mono />
                                {o.status !== 'CANCELLED' && (
                                    <Fld k={o.status === 'CONTRACTED' ? t.supplier.orders.fldSigned : t.supplier.orders.fldSignDeadline}
                                        v={o.status === 'CONTRACTED'
                                            ? fmtDateTime(new Date(o.signedAt!))
                                            : t.supplier.orders.signDeadlineNote(fmtDateTime(new Date(o.signByDeadline)))} mono />
                                )}
                                {o.status === 'CANCELLED' && (
                                    <Fld k={t.supplier.orders.fldCancel} v={`${o.cancelReason ? cancelReason(t)[o.cancelReason] : X} · ${o.cancelledAt ? fmtDateTime(new Date(o.cancelledAt)) : X}`} />
                                )}
                            </Fields>
                        </CardBody>
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr><th>{t.customer.orderDetail.colCode}</th><th>{t.common.table.name}</th><th>{t.supplier.hallDetail.colMaterialSurface}</th><th className="n">{t.customer.quotes.colQty}</th><th className="n">{t.supplier.hallDetail.colUnitPrice}</th><th className="n">{t.supplier.hallDetail.colSubtotal}</th><th>{t.supplier.hallDetail.colDrawing}</th><th>{t.customer.orderDetail.colProgress}</th></tr>
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
                                                {/* 取消的单不给图；已接 / 待签 / 已签都给 —— 签完才是最需要图纸的时候 */}
                                                {o.status !== 'CANCELLED' && l.files.length ? l.files.map((f) => (
                                                    <div key={f.id}>
                                                        <button className="btn qui sm" type="button" onClick={() => view(o.id, l.id, f.id)}>{f.originalFilename}</button>
                                                    </div>
                                                )) : X}
                                            </td>
                                            <td>
                                                {/* 返工 / 重做拆出来的行没有价格 —— 成本供应商自担，合计不变 */}
                                                {l.status ? pill(lineSt(t)[l.status]) : X}
                                                {l.replacesPartId && <div className="t2">{t.supplier.orders.reworkLine}</div>}
                                                {inFlow && l.status === 'PENDING' && (
                                                    <div><button className="btn qui sm" type="button" disabled={busy}
                                                        onClick={() => act(() => startSupplierLine(o.id, l.id))}>{t.supplier.orders.start}</button></div>
                                                )}
                                                {inFlow && l.status === 'IN_PRODUCTION' && (
                                                    <div><button className="btn qui sm" type="button" disabled={busy}
                                                        onClick={() => act(() => producedSupplierLine(o.id, l.id))}>{t.supplier.orders.produced}</button></div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        </CardBody>
                        {o.status === 'ACCEPTED' && (
                            <CardFoot
                                left={<span className="t2">{t.supplier.orders.awaitingContract}</span>}
                                right={<button className="btn" type="button" disabled={busy} onClick={() => withdraw(o)}>{t.supplier.orders.withdraw}</button>}
                            />
                        )}
                        {o.status === 'CONTRACT_PENDING' && (
                            <CardFoot
                                left={<span className="t2">{t.supplier.orders.signNote}</span>}
                                right={
                                    <>
                                        <button className="btn" type="button" disabled={busy} onClick={() => withdraw(o)}>{t.supplier.orders.withdraw}</button>
                                        <button className="btn pri" type="button" disabled={busy} onClick={() => sign(o)}>{t.supplier.orders.signConfirm}</button>
                                    </>
                                }
                            />
                        )}
                        {inFlow && o.status !== 'FULFILLED' && (
                            <CardFoot
                                left={<span className="t2">
                                    {unfinished > 0
                                        ? t.supplier.orders.unfinished(unfinished)
                                        : readyToShip > 0
                                            ? t.supplier.orders.readyToShip(readyToShip)
                                            : t.supplier.orders.shipped}
                                </span>}
                                right={readyToShip > 0 && unfinished === 0
                                    ? <button className="btn pri" type="button" disabled={busy} onClick={() => ship(o)}>{t.supplier.orders.ship}</button>
                                    : undefined}
                            />
                        )}
                        {o.status === 'FULFILLED' && (
                            <CardFoot left={<span className="t2">{t.supplier.orders.allFulfilled}</span>} />
                        )}
                    </Card>
                )
            })}
        </Page>
    )
}
