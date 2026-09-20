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
import { CANCEL_REASON, LINE_ST, shortId, SUPPLIER_ORDER_ST } from '../ops/dispatchStatus'

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
        if (!window.confirm(`签字确认这张单？合计 ¥ ${M(prices[o.id]?.total ?? 0)}、交期 ${o.supplierDueDate}。签完不能退单、不能改。`)) return
        setBusy(true)
        signSupplierOrder(o.id)
            .then(() => load())
            .catch((e) => setErr(errorText(t, e)))
            .finally(() => setBusy(false))
    }

    const withdraw = (o: SupplierOrderView) => {
        if (!window.confirm('退掉这张单？退单后平台会重新派给别人。')) return
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
        if (!window.confirm('把这一批发给平台？平台收到后开始质检。')) return
        act(() => shipSupplierOrder(o.id))
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
                const inFlow = IN_PRODUCTION_FLOW.includes(o.status)
                const unfinished = o.lines.filter((l) => l.status === 'PENDING' || l.status === 'IN_PRODUCTION').length
                const readyToShip = o.lines.filter((l) => l.status === 'PRODUCED').length
                return (
                    <Card key={o.id} style={{ marginBottom: 16 }}>
                        <CardHead title={`订单 ${shortId(o.id)}`} right={pill(SUPPLIER_ORDER_ST[o.status])} />
                        <CardBody>
                            <Fields>
                                <Fld k="交期" v={o.supplierDueDate} mono />
                                <Fld k="合计" v={p ? `¥ ${M(p.total)}` : X} mono />
                                <Fld k="接单时间" v={fmtDateTime(new Date(o.acceptedAt))} mono />
                                {o.status !== 'CANCELLED' && (
                                    <Fld k={o.status === 'CONTRACTED' ? '签字时间' : '签字期限'}
                                        v={o.status === 'CONTRACTED'
                                            ? fmtDateTime(new Date(o.signedAt!))
                                            : `${fmtDateTime(new Date(o.signByDeadline))}（接单起 7 天）`} mono />
                                )}
                                {o.status === 'CANCELLED' && (
                                    <Fld k="取消" v={`${o.cancelReason ? CANCEL_REASON[o.cancelReason] : X} · ${o.cancelledAt ? fmtDateTime(new Date(o.cancelledAt)) : X}`} />
                                )}
                            </Fields>
                        </CardBody>
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr><th>图号</th><th>名称</th><th>材料 / 表面处理</th><th className="n">数量</th><th className="n">单价 ¥</th><th className="n">小计 ¥</th><th>图纸</th><th>进度</th></tr>
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
                                                {l.status ? pill(LINE_ST[l.status]) : X}
                                                {l.replacesPartId && <div className="t2">返工 / 重做件</div>}
                                                {inFlow && l.status === 'PENDING' && (
                                                    <div><button className="btn qui sm" type="button" disabled={busy}
                                                        onClick={() => act(() => startSupplierLine(o.id, l.id))}>开工</button></div>
                                                )}
                                                {inFlow && l.status === 'IN_PRODUCTION' && (
                                                    <div><button className="btn qui sm" type="button" disabled={busy}
                                                        onClick={() => act(() => producedSupplierLine(o.id, l.id))}>完工</button></div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        </CardBody>
                        {o.status === 'ACCEPTED' && (
                            <CardFoot
                                left={<span className="t2">等平台把合同建出来。到期还没签字，这张单会自动取消、退回平台重派。</span>}
                                right={<button className="btn" type="button" disabled={busy} onClick={() => withdraw(o)}>退单</button>}
                            />
                        )}
                        {o.status === 'CONTRACT_PENDING' && (
                            <CardFoot
                                left={<span className="t2">签字即确认这张单的零件、价格和交期，签完不能退、不能改。</span>}
                                right={
                                    <>
                                        <button className="btn" type="button" disabled={busy} onClick={() => withdraw(o)}>退单</button>
                                        <button className="btn pri" type="button" disabled={busy} onClick={() => sign(o)}>签字确认</button>
                                    </>
                                }
                            />
                        )}
                        {inFlow && o.status !== 'FULFILLED' && (
                            <CardFoot
                                left={<span className="t2">
                                    {unfinished > 0
                                        ? `还有 ${unfinished} 行没完工 —— 整单全部完工才能发给平台。`
                                        : readyToShip > 0
                                            ? `${readyToShip} 行已完工，可以发给平台。`
                                            : '已发到平台，等质检结果。'}
                                </span>}
                                right={readyToShip > 0 && unfinished === 0
                                    ? <button className="btn pri" type="button" disabled={busy} onClick={() => ship(o)}>发给平台</button>
                                    : undefined}
                            />
                        )}
                        {o.status === 'FULFILLED' && (
                            <CardFoot left={<span className="t2">这张单的零件已全部质检合格。结算功能还没上线。</span>} />
                        )}
                    </Card>
                )
            })}
        </Page>
    )
}
