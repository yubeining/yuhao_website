/**
 * 我的订单。整条链的入口 —— 建订单、往里加零件、提交订单，都从这里进。
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input } from '../../components/form'
import {
    Bar, Card, CardBody, CardFoot, CardHead, Empty, Hello, Page, Pill, pill, TableWrap,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { createOrder, deleteOrder } from '../../mock/actions'
import { X, money, sum } from '../../mock/format'
import { num } from '../../mock/params'
import { myOrders, progress, quotesOf } from '../../mock/selectors'
import { isPublished, ORD_ST } from './status'

export function OrderListPage() {
    const { state, act, actWith } = useMock()
    const navigate = useNavigate()
    const orders = myOrders(state)
    const [title, setTitle] = useState('')
    const [adding, setAdding] = useState(false)

    const create = () => {
        const o = actWith((s) => createOrder(s, title.trim()))
        setTitle('')
        setAdding(false)
        navigate(`/customer/orders/${o.id}`)
    }

    return (
        <Page>
            <Hello
                title="我的订单"
                sub="录入零件后提交，进入估价"
                right={
                    <>
                        <Pill tone="ne" dot={false}>共 {orders.length} 单</Pill>
                        <button className="btn pri" type="button" onClick={() => setAdding(true)}>＋ 新建订单</button>
                    </>
                }
            />

            {adding && (
                <Card style={{ marginBottom: 16 }}>
                    <CardHead title="新建订单" />
                    <CardBody>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <Input value={title} placeholder="订单名称"
                                onChange={setTitle} />
                        </div>
                    </CardBody>
                    <CardFoot
                        left={<button className="btn" type="button" onClick={() => setAdding(false)}>取消</button>}
                        right={<button className="btn pri" type="button" onClick={create}>创建</button>}
                    />
                </Card>
            )}

            <Card>
                {orders.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>订单</th><th>名称</th><th className="n">零件</th><th className="n">总件数</th>
                                    <th className="n">已报价</th><th className="n">建单</th>
                                    <th>进度</th><th>状态</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((o) => {
                                    const total = quotesOf(state, o.id).reduce((a, q) => a + q.total, 0)
                                    return (
                                        <tr className="clk" key={o.id}
                                            onClick={() => navigate(`/customer/orders/${o.id}`)}>
                                            <td><span className="m">{o.id}</span></td>
                                            <td className="t1">{o.title}</td>
                                            <td className="n">{o.parts.length}</td>
                                            <td className="n">{sum(o.parts, (p) => num(p.qty))}</td>
                                            <td className="n">{total ? <b>{money(total)}</b> : X}</td>
                                            <td className="n">{o.at.slice(0, 10)}</td>
                                            <td style={{ minWidth: 100 }}>
                                                {isPublished(o.status)
                                                    ? <Bar pct={progress(o)} />
                                                    : <span style={{ color: 'var(--faint)' }}>—</span>}
                                            </td>
                                            <td>{pill(ORD_ST[o.status])}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                {o.status === 'draft' && (
                                                    <button className="btn qui sm" type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            act((s) => deleteOrder(s, o.id))
                                                        }}>删除</button>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody>
                        <Empty
                            text="暂无订单"
                            sub="新建订单后录入零件"
                            action={<button className="btn pri" type="button" onClick={() => setAdding(true)}>
                                ＋ 新建订单
                            </button>}
                        />
                    </CardBody>
                )}
            </Card>
        </Page>
    )
}
