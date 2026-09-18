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
import { DISPATCH_MODE, OPS_ORDER_ST, shortId } from './dispatchStatus'

export function OpsDispatchPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const [pool, setPool] = useState<PoolLine[] | null>(null)
    const [orders, setOrders] = useState<OpsOrderSummary[] | null>(null)
    const [picking, setPicking] = useState<PoolLine | null>(null)
    const [split, setSplit] = useState<Record<string, string>>({})
    const [err, setErr] = useState<string | null>(null)
    const [ok, setOk] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const load = useCallback(async () => {
        try {
            const [p, o] = await Promise.all([dispatchPool(), listOpsDispatchOrders()])
            setPool(p)
            setOrders(o)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])

    useEffect(() => { void load() }, [load])

    const assembling = orders?.filter((o) => o.status === 'ASSEMBLING') ?? []

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
        await load()
        setOk(`已新建生产订单 ${shortId(o.id)}`)
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
        if (badInput || !parts.length) return setErr('请在生产订单里填整数件数')
        if (sum !== picking.quantity) return setErr(`各份加起来要等于 ${picking.quantity} 件，现在是 ${sum} 件`)
        void run(async () => {
            await allocateLine(picking.customerOrderPartId, parts)
            setOk(`「${picking.code}」已分配到 ${parts.length} 张生产订单`)
            setPicking(null)
            await load()
        })
    }

    return (
        <Page>
            <Hello title="派单管理" right={<button className="btn pri" type="button" disabled={busy} onClick={() => void create()}>＋ 新建生产订单</button>} />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {ok && <Banner tone="ok" style={{ marginBottom: 14 }}>{ok}</Banner>}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title="待派的零件" rid={pool ? `${pool.length} 行` : undefined} />
                {pool === null ? (
                    <CardBody><Empty text="加载中…" /></CardBody>
                ) : pool.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>客户 / 订单</th><th>图号</th><th>名称</th><th>材料 / 表面处理</th>
                                    <th className="n">数量</th><th className="n">客户提交</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {pool.map((l) => (
                                    <tr key={l.customerOrderPartId}>
                                        <td className="t1">{l.customerName ?? X}<div className="t2">{l.orderTitle || '未命名订单'}</div></td>
                                        <td className="m">{l.code}</td>
                                        <td>{l.partName}</td>
                                        <td>{l.material || X}<div className="t2">{l.surfaceTreatment || X}</div></td>
                                        <td className="n">{l.quantity}</td>
                                        <td className="n">{l.submittedAt ? fmtDate(new Date(l.submittedAt)) : X}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button className="btn sm" type="button" onClick={() => startPick(l)}>分配</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text="没有待派的零件" sub="客户确认报价后，零件会出现在这里" /></CardBody>
                )}
            </Card>

            {picking && (
                <Card style={{ marginBottom: 16 }}>
                    <CardHead title={`分配：${picking.code} · ${picking.partName} · ${picking.quantity} 件`} />
                    <CardBody>
                        {assembling.length ? (
                            <TableWrap>
                                <thead><tr><th>生产订单（组装中）</th><th className="n">已有零件行</th><th>这一行分几件</th></tr></thead>
                                <tbody>
                                    {assembling.map((o) => (
                                        <tr key={o.id}>
                                            <td className="m">{shortId(o.id)}</td>
                                            <td className="n">{o.lineCount}</td>
                                            <td>
                                                <Input value={split[o.id] ?? ''} placeholder="件" style={{ width: 90 }}
                                                    onChange={(v) => setSplit((s) => ({ ...s, [o.id]: v }))} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        ) : (
                            <Empty text="没有组装中的生产订单" sub="先点右上角「新建生产订单」" />
                        )}
                        <div className="t2" style={{ marginTop: 8 }}>
                            一次拆完：各份加起来必须等于 {picking.quantity} 件（现在 {sum} 件）。只分给一张就在那一张填 {picking.quantity}。
                        </div>
                    </CardBody>
                    <CardFoot
                        left={<button className="btn" type="button" onClick={() => setPicking(null)}>取消</button>}
                        right={<button className="btn pri" type="button" disabled={busy || !assembling.length} onClick={allocate}>确认分配</button>}
                    />
                </Card>
            )}

            <Card>
                <CardHead title="生产订单" rid={orders ? `${orders.length} 张` : undefined} />
                {orders === null ? (
                    <CardBody><Empty text="加载中…" /></CardBody>
                ) : orders.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>编号</th><th>状态</th><th>派法</th><th className="n">零件行</th><th className="n">件数</th>
                                    <th className="n">客户数</th><th className="n">对供交期</th><th>接单方</th><th className="n">建立</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((o) => (
                                    <tr className="clk" key={o.id} onClick={() => navigate(`/ops/dispatch/${o.id}`)}>
                                        <td className="m">{shortId(o.id)}</td>
                                        <td>{pill(OPS_ORDER_ST[o.status])}</td>
                                        <td>{o.dispatchMode ? DISPATCH_MODE[o.dispatchMode] : X}</td>
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
                    </CardBody>
                ) : (
                    <CardBody><Empty text="还没有生产订单" /></CardBody>
                )}
            </Card>
        </Page>
    )
}
