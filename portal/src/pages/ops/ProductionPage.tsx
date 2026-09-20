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
import { LINE_ST, shortId, SUPPLIER_ORDER_ST } from './dispatchStatus'

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
            setErr(`三个数之和要等于 ${line.quantity} 件（现在是 ${pass + rework + scrap}）`)
            return
        }
        if (rework + scrap > 0
            && !window.confirm(`判定：合格 ${pass} / 返工 ${rework} / 报废 ${scrap}。返工件和报废件会从这一行拆出去。`)) {
            return
        }
        act(() => qcLine(orderId, line.id, { pass, rework, scrap })
            .then(() => setCounts((prev) => ({ ...prev, [line.id]: EMPTY }))))
    }

    const set = (lineId: string, k: keyof Counts, v: string) =>
        setCounts((prev) => ({ ...prev, [lineId]: { ...(prev[lineId] ?? EMPTY), [k]: v } }))

    return (
        <Page>
            <Hello title="生产与质检" sub="签完字的单在这里跟进度；货到之后按件数判合格 / 返工 / 报废" />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {orders === null ? (
                <Card><CardBody><Empty text="加载中…" /></CardBody></Card>
            ) : orders.length === 0 ? (
                <Card><CardBody><Empty text="还没有已签字的单" sub="供应商签完合同后会出现在这里" /></CardBody></Card>
            ) : orders.map((o) => (
                <Card key={o.id} style={{ marginBottom: 16 }}>
                    <CardHead title={`供应商订单 ${shortId(o.id)}`} right={pill(SUPPLIER_ORDER_ST[o.status])} />
                    <CardBody>
                        <Fields>
                            <Fld k="供应商" v={o.supplierName || X} />
                            <Fld k="生产订单" v={shortId(o.opsOrderId)} mono />
                            <Fld k="对供交期" v={o.supplierDueDate} mono />
                            <Fld k="签字时间" v={o.signedAt ? fmtDateTime(new Date(o.signedAt)) : X} mono />
                        </Fields>
                    </CardBody>
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr><th>图号</th><th>名称</th><th>客户</th><th className="n">数量</th><th>进度</th><th>质检 / 补料</th></tr>
                            </thead>
                            <tbody>
                                {o.lines.map((l) => {
                                    const c = counts[l.id] ?? EMPTY
                                    return (
                                        <tr key={l.id}>
                                            <td className="m">{l.code}</td>
                                            <td className="t1">{l.partName}
                                                {l.replacesPartId && <div className="t2">返工 / 重做件</div>}
                                            </td>
                                            <td>{l.customerName || X}<div className="t2">{l.orderTitle || X}</div></td>
                                            <td className="n">{l.quantity}</td>
                                            <td>{l.status ? pill(LINE_ST[l.status]) : X}</td>
                                            <td>
                                                {l.status === 'QC_PENDING' && (
                                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                                        <input className="inp" style={{ width: 62 }} type="number" min={0} placeholder="合格"
                                                            value={c.pass} onChange={(e) => set(l.id, 'pass', e.target.value)} />
                                                        <input className="inp" style={{ width: 62 }} type="number" min={0} placeholder="返工"
                                                            value={c.rework} onChange={(e) => set(l.id, 'rework', e.target.value)} />
                                                        <input className="inp" style={{ width: 62 }} type="number" min={0} placeholder="报废"
                                                            value={c.scrap} onChange={(e) => set(l.id, 'scrap', e.target.value)} />
                                                        <button className="btn pri sm" type="button" disabled={busy}
                                                            onClick={() => submitQc(o.id, l)}>提交</button>
                                                    </div>
                                                )}
                                                {l.status === 'SCRAPPED' && (l.supersededBy
                                                    ? <span className="t2">已补料</span>
                                                    : <button className="btn sm" type="button" disabled={busy}
                                                        onClick={() => act(() => remakeLine(o.id, l.id))}>原厂重做</button>)}
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
