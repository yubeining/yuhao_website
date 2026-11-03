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
import { fmtDate } from '../../mock/format'
import { cancelOrder, createOrder, listOrders, type OrderSummaryView } from '../../services'
import { orderSt } from './status'

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
                title={t.customer.orders.title}
                sub={t.customer.orders.sub}
                right={
                    <>
                        {orders && <Pill tone="ne" dot={false}>{t.customer.orders.count(orders.length)}</Pill>}
                        <button className="btn pri" type="button" onClick={() => setAdding(true)}>{t.customer.orders.newOrder}</button>
                    </>
                }
            />

            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}

            {adding && (
                <Card style={{ marginBottom: 16 }}>
                    <CardHead title={t.customer.orders.newTitle} />
                    <CardBody>
                        <Input value={title} placeholder={t.customer.orders.titlePlaceholder} onChange={setTitle} />
                    </CardBody>
                    <CardFoot
                        left={<button className="btn" type="button" onClick={() => setAdding(false)}>{t.common.cancel}</button>}
                        right={<button className="btn pri" type="button" onClick={create} disabled={busy}>{t.common.create}</button>}
                    />
                </Card>
            )}

            <Card>
                {orders === null ? (
                    <CardBody><Empty text={t.common.loading} /></CardBody>
                ) : orders.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>{t.common.table.name}</th><th className="n">{t.common.table.parts}</th><th className="n">{t.common.table.quantity}</th>
                                    <th className="n">{t.common.table.created}</th><th>{t.common.table.status}</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((o) => (
                                    <tr className="clk" key={o.id} onClick={() => navigate(`/customer/orders/${o.id}`)}>
                                        <td className="t1">{o.title || t.common.untitledOrder}</td>
                                        <td className="n">{o.lineCount}</td>
                                        <td className="n">{o.totalQuantity}</td>
                                        <td className="n">{fmtDate(new Date(o.createdAt))}</td>
                                        <td>{pill(orderSt(t)[o.status])}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            {o.status === 'DRAFT' && (
                                                <button className="btn qui sm" type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        // 取消没有撤销，点错就回不来
                                                        if (window.confirm(t.customer.orders.cancelConfirm)) void cancel(o.id)
                                                    }}>{t.customer.orders.cancelOrder}</button>
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
                            text={t.customer.orders.empty}
                            sub={t.customer.orders.emptySub}
                            action={<button className="btn pri" type="button" onClick={() => setAdding(true)}>{t.customer.orders.newOrder}</button>}
                        />
                    </CardBody>
                )}
            </Card>
        </Page>
    )
}
