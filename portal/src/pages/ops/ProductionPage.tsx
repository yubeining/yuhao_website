/**
 * 生产与质检（2026-09-20 拍板）。签完字之后的供应商订单都在这里。
 *
 * ★ 供应商只报「开工 / 完工」，不报件数；整单全部完工才能发到平台。
 * ★ 货到之后我们按<b>件数</b>判：合格 / 返工 / 报废，三个数之和必须等于该行件数。
 *   返工件和报废件从原行拆出来另开一行 —— 返工件供应商重做（不加钱），报废件等运营点「原厂重做」补料。
 * ★ 本轮只有「原厂重做」一种补料；换一家做、差价扣款还没做，不要在这里假装有。
 */

import { useCallback, useEffect, useState } from 'react'
import { Banner, Card, CardBody, CardHead, Empty, Fields, Fld, Hello, Page, pill, TableWrap } from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { fmtDateTime, X } from '../../mock/format'
import { listProduction, qcLine, remakeLine, type OpsLine, type OpsProductionOrder } from '../../services'
import { lineSt, shortId, supplierOrderSt } from './dispatchStatus'

/** 一行待质检的三个数，按行 id 存着。 */
type Counts = { pass: string; rework: string; scrap: string }

const EMPTY: Counts = { pass: '', rework: '', scrap: '' }
const num = (v: string) => (v.trim() === '' ? 0 : Number(v))

export function OpsProductionPage() {
    const { t } = useMock()
    const [orders, setOrders] = useState<OpsProductionOrder[] | null>(null)
    const [counts, setCounts] = useState<Record<string, Counts>>({})
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const load = useCallback(async () => {
        try {
            setOrders(await listProduction())
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])

    useEffect(() => { void load() }, [load])

    const act = (run: () => Promise<unknown>) => {
        setBusy(true)
        run()
            .then(() => load())
            .catch((e) => setErr(errorText(t, e)))
            .finally(() => setBusy(false))
    }

    const submitQc = (orderId: string, line: OpsLine) => {
        const c = counts[line.id] ?? EMPTY
        const [pass, rework, scrap] = [num(c.pass), num(c.rework), num(c.scrap)]
        if (pass + rework + scrap !== line.quantity) {
            setErr(t.ops.production.sumMismatch(line.quantity, pass + rework + scrap))
            return
        }
        if (rework + scrap > 0
            && !window.confirm(t.ops.production.confirmQc(pass, rework, scrap))) {
            return
        }
        act(() => qcLine(orderId, line.id, { pass, rework, scrap })
            .then(() => setCounts((prev) => ({ ...prev, [line.id]: EMPTY }))))
    }

    const set = (lineId: string, k: keyof Counts, v: string) =>
        setCounts((prev) => ({ ...prev, [lineId]: { ...(prev[lineId] ?? EMPTY), [k]: v } }))

    return (
        <Page>
            <Hello title={t.ops.production.title} sub={t.ops.production.sub} />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {orders === null ? (
                <Card><CardBody><Empty text={t.common.loading} /></CardBody></Card>
            ) : orders.length === 0 ? (
                <Card><CardBody><Empty text={t.ops.production.empty} sub={t.ops.production.emptySub} /></CardBody></Card>
            ) : orders.map((o) => (
                <Card key={o.id} style={{ marginBottom: 16 }}>
                    <CardHead title={t.ops.production.cardTitle(shortId(o.id))} right={pill(supplierOrderSt(t)[o.status])} />
                    <CardBody>
                        <Fields>
                            <Fld k={t.ops.production.fldSupplier} v={o.supplierName || X} />
                            <Fld k={t.ops.production.fldOpsOrder} v={shortId(o.opsOrderId)} mono />
                            <Fld k={t.ops.production.fldDue} v={o.supplierDueDate} mono />
                            <Fld k={t.ops.production.fldSignedAt} v={o.signedAt ? fmtDateTime(new Date(o.signedAt)) : X} mono />
                        </Fields>
                    </CardBody>
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr><th>{t.customer.orderDetail.colCode}</th><th>{t.common.table.name}</th><th>{t.ops.production.colCustomer}</th><th className="n">{t.customer.quotes.colQty}</th><th>{t.customer.orderDetail.colProgress}</th><th>{t.ops.production.colQc}</th></tr>
                            </thead>
                            <tbody>
                                {o.lines.map((l) => {
                                    const c = counts[l.id] ?? EMPTY
                                    return (
                                        <tr key={l.id}>
                                            <td className="m">{l.code}</td>
                                            <td className="t1">{l.partName}
                                                {l.replacesPartId && <div className="t2">{t.ops.production.reworkLine}</div>}
                                            </td>
                                            <td>{l.customerName || X}<div className="t2">{l.orderTitle || X}</div></td>
                                            <td className="n">{l.quantity}</td>
                                            <td>{l.status ? pill(lineSt(t)[l.status]) : X}</td>
                                            <td>
                                                {l.status === 'QC_PENDING' && (
                                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                                        <input className="inp" style={{ width: 62 }} type="number" min={0} placeholder={t.ops.production.phPass}
                                                            value={c.pass} onChange={(e) => set(l.id, 'pass', e.target.value)} />
                                                        <input className="inp" style={{ width: 62 }} type="number" min={0} placeholder={t.ops.production.phRework}
                                                            value={c.rework} onChange={(e) => set(l.id, 'rework', e.target.value)} />
                                                        <input className="inp" style={{ width: 62 }} type="number" min={0} placeholder={t.ops.production.phScrap}
                                                            value={c.scrap} onChange={(e) => set(l.id, 'scrap', e.target.value)} />
                                                        <button className="btn pri sm" type="button" disabled={busy}
                                                            onClick={() => submitQc(o.id, l)}>{t.ops.production.submit}</button>
                                                    </div>
                                                )}
                                                {l.status === 'SCRAPPED' && (l.supersededBy
                                                    ? <span className="t2">{t.ops.production.remade}</span>
                                                    : <button className="btn sm" type="button" disabled={busy}
                                                        onClick={() => act(() => remakeLine(o.id, l.id))}>{t.ops.production.remake}</button>)}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                </Card>
            ))}
        </Page>
    )
}
