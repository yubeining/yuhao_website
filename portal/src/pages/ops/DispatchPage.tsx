/**
 * 派单管理 —— 已确认报价的客户零件行（待派池）拆进生产订单，再到生产订单详情里派出去（2026-09-18 拍板）。
 *
 * ★ 一行可以拆给几张生产订单，但**一次拆完**：各份之和必须等于这一行的数量，不能先拆一部分放着。
 *   撤回也是整行一起撤（在生产订单详情里）。
 * ★ 一张生产订单整单交给一家；可以装多个客户订单的零件（D13）。
 * ★ 以前这一页是原型（目标价、合计金额都是编的公式），已换成真数据。对供价在生产订单详情里按各家折率看。
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input } from '../../components/form'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Empty, Hello, Page, pill, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { fmtDate, fmtDateTime, X } from '../../mock/format'
import {
    allocateLine, createOpsDispatchOrder, dispatchPool, listOpsDispatchOrders,
    type OpsOrderSummary, type PoolLine,
} from '../../services'
import { dispatchMode, opsOrderSt, shortId } from './dispatchStatus'
import { Pagination } from '../../components/Pagination'

export function OpsDispatchPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const [pool, setPool] = useState<PoolLine[] | null>(null)
    const [poolTotal, setPoolTotal] = useState(0)
    const [poolPage, setPoolPage] = useState(1)
    const [orders, setOrders] = useState<OpsOrderSummary[] | null>(null)
    const [ordersTotal, setOrdersTotal] = useState(0)
    const [ordersPage, setOrdersPage] = useState(1)
    // 拆单时要把行分给「组装中」的生产订单 —— 这个列表要全量，不能被分页切掉
    const [assembling, setAssembling] = useState<OpsOrderSummary[]>([])
    const [picking, setPicking] = useState<PoolLine | null>(null)
    const [split, setSplit] = useState<Record<string, string>>({})
    const [err, setErr] = useState<string | null>(null)
    const [ok, setOk] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const load = useCallback(async (poolPageNo: number, ordersPageNo: number) => {
        try {
            const [p, o, a] = await Promise.all([
                dispatchPool(poolPageNo, 20),
                listOpsDispatchOrders(undefined, ordersPageNo, 20),
                listOpsDispatchOrders('ASSEMBLING', 1, 200),
            ])
            setPool(p.items)
            setPoolTotal(p.total)
            setOrders(o.items)
            setOrdersTotal(o.total)
            setAssembling(a.items)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])

    useEffect(() => { void load(poolPage, ordersPage) }, [load, poolPage, ordersPage])

    const run = async (fn: () => Promise<void>) => {
        setBusy(true)
        try {
            await fn()
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const create = () => run(async () => {
        const o = await createOpsDispatchOrder()
        await load(poolPage, ordersPage)
        setOk(t.ops.dispatchPage.created(shortId(o.id)))
    })

    const startPick = (l: PoolLine) => {
        setPicking(l)
        setSplit({})
        setOk(null)
    }

    const parts = Object.entries(split)
        .map(([opsOrderId, raw]) => ({ opsOrderId, quantity: Number(raw.trim()) }))
        .filter((p) => p.quantity > 0)
    const badInput = Object.values(split).some((raw) => raw.trim() !== '' && (!/^\d+$/.test(raw.trim())))
    const sum = parts.reduce((a, p) => a + p.quantity, 0)

    const allocate = () => {
        if (!picking) return
        if (badInput || !parts.length) return setErr(t.ops.dispatchPage.errInteger)
        if (sum !== picking.quantity) return setErr(t.ops.dispatchPage.errSplitMismatch(picking.quantity, sum))
        void run(async () => {
            await allocateLine(picking.customerOrderPartId, parts)
            setOk(t.ops.dispatchPage.allocated(picking.code, parts.length))
            setPicking(null)
            await load(poolPage, ordersPage)
        })
    }

    return (
        <Page>
            <Hello title={t.ops.dispatchPage.title} right={<button className="btn pri" type="button" disabled={busy} onClick={() => void create()}>{t.ops.dispatchPage.newOpsOrder}</button>} />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {ok && <Banner tone="ok" style={{ marginBottom: 14 }}>{ok}</Banner>}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title={t.ops.dispatchPage.poolTitle} rid={pool ? t.ops.dispatchPage.poolCount(poolTotal) : undefined} />
                {pool === null ? (
                    <CardBody><Empty text={t.common.loading} /></CardBody>
                ) : pool.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>{t.ops.dispatchPage.colCustomerOrder}</th><th>{t.customer.orderDetail.colCode}</th><th>{t.common.table.name}</th><th>{t.ops.dispatchPage.colMaterialSurface}</th>
                                    <th className="n">{t.customer.quotes.colQty}</th><th className="n">{t.ops.dispatchPage.colSubmitted}</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {pool.map((l) => (
                                    <tr key={l.customerOrderPartId}>
                                        <td className="t1">{l.customerName ?? X}<div className="t2">{l.orderTitle || t.common.untitledOrder}</div></td>
                                        <td className="m">{l.code}</td>
                                        <td>{l.partName}</td>
                                        <td>{l.material || X}<div className="t2">{l.surfaceTreatment || X}</div></td>
                                        <td className="n">{l.quantity}</td>
                                        <td className="n">{l.submittedAt ? fmtDate(new Date(l.submittedAt)) : X}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button className="btn sm" type="button" onClick={() => startPick(l)}>{t.ops.dispatchPage.allocate}</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                        <Pagination page={poolPage} pageSize={20} total={poolTotal}
                            onChange={(p) => { setPoolPage(p); void load(p, ordersPage) }} />
                    </CardBody>
                ) : (
                    <CardBody><Empty text={t.ops.dispatchPage.poolEmpty} sub={t.ops.dispatchPage.poolEmptySub} /></CardBody>
                )}
            </Card>

            {picking && (
                <Card style={{ marginBottom: 16 }}>
                    <CardHead title={t.ops.dispatchPage.pickTitle(picking.code, picking.partName, picking.quantity)} />
                    <CardBody>
                        {assembling.length ? (
                            <TableWrap>
                                <thead><tr><th>{t.ops.dispatchPage.colOpsOrder}</th><th className="n">{t.ops.dispatchPage.colExistingLines}</th><th>{t.ops.dispatchPage.colSplitQty}</th></tr></thead>
                                <tbody>
                                    {assembling.map((o) => (
                                        <tr key={o.id}>
                                            <td className="m">{shortId(o.id)}</td>
                                            <td className="n">{o.lineCount}</td>
                                            <td>
                                                <Input value={split[o.id] ?? ''} placeholder={t.ops.dispatchPage.unitPieces} style={{ width: 90 }}
                                                    onChange={(v) => setSplit((s) => ({ ...s, [o.id]: v }))} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        ) : (
                            <Empty text={t.ops.dispatchPage.noAssembling} sub={t.ops.dispatchPage.noAssemblingSub} />
                        )}
                        <div className="t2" style={{ marginTop: 8 }}>
                            {t.ops.dispatchPage.splitNote(picking.quantity, sum)}
                        </div>
                    </CardBody>
                    <CardFoot
                        left={<button className="btn" type="button" onClick={() => setPicking(null)}>{t.ops.dispatchPage.cancel}</button>}
                        right={<button className="btn pri" type="button" disabled={busy || !assembling.length} onClick={allocate}>{t.ops.dispatchPage.confirmAllocate}</button>}
                    />
                </Card>
            )}

            <Card>
                <CardHead title={t.ops.dispatchPage.ordersTitle} rid={orders ? t.ops.dispatchPage.orderCount(ordersTotal) : undefined} />
                {orders === null ? (
                    <CardBody><Empty text={t.common.loading} /></CardBody>
                ) : orders.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>{t.ops.dispatchPage.colNo}</th><th>{t.common.table.status}</th><th>{t.ops.dispatchPage.colMode}</th><th className="n">{t.ops.dispatchPage.colLines}</th><th className="n">{t.ops.dispatchPage.colPieces}</th>
                                    <th className="n">{t.ops.dispatchPage.colCustomers}</th><th className="n">{t.ops.dispatchPage.colSupplierDue}</th><th>{t.ops.dispatchPage.colAcceptedBy}</th><th className="n">{t.ops.dispatchPage.colBuilt}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((o) => (
                                    <tr className="clk" key={o.id} onClick={() => navigate(`/ops/dispatch/${o.id}`)}>
                                        <td className="m">{shortId(o.id)}</td>
                                        <td>{pill(opsOrderSt(t)[o.status])}</td>
                                        <td>{o.dispatchMode ? dispatchMode(t)[o.dispatchMode] : X}</td>
                                        <td className="n">{o.lineCount}</td>
                                        <td className="n">{o.totalQuantity}</td>
                                        <td className="n">{o.customerCount}</td>
                                        <td className="n">{o.status !== 'ASSEMBLING' && o.supplierDueDate ? o.supplierDueDate : X}</td>
                                        <td>{o.acceptedSupplierName ?? X}</td>
                                        <td className="n">{fmtDateTime(new Date(o.createdAt))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                        <Pagination page={ordersPage} pageSize={20} total={ordersTotal}
                            onChange={(p) => { setOrdersPage(p); void load(poolPage, p) }} />
                    </CardBody>
                ) : (
                    <CardBody><Empty text={t.ops.dispatchPage.ordersEmpty} /></CardBody>
                )}
            </Card>
        </Page>
    )
}
