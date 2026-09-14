/**
 * 我的订单。整条链的入口 —— 建订单、往里加零件、提交订单，都从这里进。
 *
 * ★ 数据全部来自后端（2026-09-14 起客户端不再读假数据）。
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input } from '../../components/form'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Empty, Hello, Page, Pill, pill, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { cancelOrder, createOrder, listOrders, type OrderSummaryView } from '../../services'
import { ORDER_ST } from './status'

export function OrderListPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const [orders, setOrders] = useState<OrderSummaryView[] | null>(null)
    const [title, setTitle] = useState('')
    const [adding, setAdding] = useState(false)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const load = useCallback(async () => {
        try {
            setOrders((await listOrders(1, 100)).items)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])

    useEffect(() => { void load() }, [load])

    const create = async () => {
        setBusy(true)
        try {
            const o = await createOrder({ title: title.trim() || null, wantedLeadDays: null })
            navigate(`/customer/orders/${o.id}`)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const cancel = async (id: string) => {
        try {
            await cancelOrder(id)
            await load()
        } catch (e) {
            setErr(errorText(t, e))
        }
    }

    return (
        <Page>
            <Hello
                title="我的订单"
                sub="录入零件、传好图纸后提交"
                right={
                    <>
                        {orders && <Pill tone="ne" dot={false}>共 {orders.length} 单</Pill>}
                        <button className="btn pri" type="button" onClick={() => setAdding(true)}>＋ 新建订单</button>
                    </>
                }
            />

            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}

            {adding && (
                <Card style={{ marginBottom: 16 }}>
                    <CardHead title="新建订单" />
                    <CardBody>
                        <Input value={title} placeholder="订单名称（可选）" onChange={setTitle} />
                    </CardBody>
                    <CardFoot
                        left={<button className="btn" type="button" onClick={() => setAdding(false)}>取消</button>}
                        right={<button className="btn pri" type="button" onClick={create} disabled={busy}>创建</button>}
                    />
                </Card>
            )}

            <Card>
                {orders === null ? (
                    <CardBody><Empty text="加载中…" /></CardBody>
                ) : orders.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>名称</th><th className="n">零件</th><th className="n">总件数</th>
                                    <th className="n">建单</th><th>状态</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((o) => (
                                    <tr className="clk" key={o.id} onClick={() => navigate(`/customer/orders/${o.id}`)}>
                                        <td className="t1">{o.title || '未命名订单'}</td>
                                        <td className="n">{o.lineCount}</td>
                                        <td className="n">{o.totalQuantity}</td>
                                        <td className="n">{o.createdAt.slice(0, 10)}</td>
                                        <td>{pill(ORDER_ST[o.status])}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            {o.status === 'DRAFT' && (
                                                <button className="btn qui sm" type="button"
                                                    onClick={(e) => { e.stopPropagation(); void cancel(o.id) }}>取消订单</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody>
                        <Empty
                            text="暂无订单"
                            sub="新建订单后录入零件"
                            action={<button className="btn pri" type="button" onClick={() => setAdding(true)}>＋ 新建订单</button>}
                        />
                    </CardBody>
                )}
            </Card>
        </Page>
    )
}
