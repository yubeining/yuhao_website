/**
 * 派单管理 —— **发布的入口**，也是发布之后看每个派单包下场的地方。
 *
 * ★ 发布是我方的动作，不是客户的：供应商是我们的资源，目标价是内部算的，
 *   什么时候放出去给供应商看由运营决定。客户那边确认的只是价格。
 *
 * ★ 一个零件一个派单包，各自独立抢单、独立成败。某一个无人接单退回，
 *   不影响同一订单的其他零件 —— 这是拆包这个做法的意义所在。
 */

import { useState } from 'react'
import { Input } from '../../components/form'
import { Card, CardBody, CardFoot, CardHead, Empty, Hello, Page, Pill, pill, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { custPaid, deliver, dropLine, findCompany, repost } from '../../mock/actions'
import { M } from '../../mock/format'
import { pkgsOf } from '../../mock/selectors'
import { isPublished, ORD_ST } from '../customer/status'
import type { Pkg } from '../../mock/types'

const PKG_ST = (st: Pkg['status']) =>
    st === 'open' ? <Pill tone="in">在抢</Pill>
        : st === 'dropped' ? <Pill tone="ba">已退回</Pill>
            : st === 'done' ? <Pill tone="ok">已完工</Pill>
                : <Pill tone="ok">已抢</Pill>

export function OpsDispatchPage() {
    const { state, act } = useMock()
    // 调价重挂的新目标价草稿，key 是派单号。空着时按钮不可点 —— 不替运营编一个涨幅。
    const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})
    // 已发布的订单。发布由客户在订单页发起，这里是发布之后的管理视图。
    const orders = state.db.orders.filter((o) =>
        isPublished(o.status))

    if (!orders.length) {
        return (
            <Page>
                <Hello title="派单管理" />
                <Card><CardBody>
                    <Empty text="暂无已发布订单" sub="客户发布后在此管理派单包" />
                </CardBody></Card>
            </Page>
        )
    }

    return (
        <Page>
            <Hello title="派单管理" sub="已发布订单的派单包与产能状态" />
            {orders.map((o) => {
                const ps = pkgsOf(state, o.id)
                const locked = ps.filter((p) => p.status === 'taken' || p.status === 'done').length
                return (
                    <Card key={o.id} style={{ marginBottom: 18 }}>
                        <CardHead
                            title={o.id}
                            rid={`${findCompany(state, o.companyId)?.name} · ${o.title}`}
                            right={
                                <>
                                    {ps.length > 0 && (
                                        <Pill tone={locked === ps.length ? 'ok' : 'wa'}>
                                            {locked} / {ps.length} 已锁定
                                        </Pill>
                                    )}
                                    {pill(ORD_ST[o.status])}
                                </>
                            }
                        />

                        <>
                            <CardBody flush>
                                    <TableWrap>
                                        <thead>
                                            <tr>
                                                <th>零件 / 派单号</th><th>规格</th><th className="n">数量</th>
                                                <th className="n">目标价</th><th>付款周期</th><th>状态</th>
                                                <th>供应商</th><th />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ps.map((p) => (
                                                <tr key={p.id} className={p.status === 'dropped' ? 'dim' : ''}>
                                                    <td>
                                                        <div className="t1">{p.partName}</div>
                                                        <div className="t2">
                                                            <span className="m">{p.id}</span>
                                                            {/* ★ 内部可以看客户图号，从订单零件回溯 ——
                                                                派单包里刻意不存它 */}
                                                            {o.parts[p.line]?.no ? ` · ${o.parts[p.line].no}` : ''}
                                                        </div>
                                                    </td>
                                                    <td>{p.mat} · {p.surf}</td>
                                                    <td className="n">{p.qty}</td>
                                                    <td className="n">
                                                        <b>¥ {M(p.target)}</b>
                                                        {p.reprice ? <div className="t2">已调价 {p.reprice} 次</div> : null}
                                                    </td>
                                                    <td>{p.pay}</td>
                                                    <td>{PKG_ST(p.status)}</td>
                                                    <td>
                                                        {p.sup ? findCompany(state, p.sup)?.name
                                                            : <span style={{ color: 'var(--faint)' }}>—</span>}
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        {p.status === 'open' && (
                                                            <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                                                <Input value={priceDrafts[p.id] ?? ''} placeholder="新目标价 ¥"
                                                                    style={{ width: 104, textAlign: 'right' }}
                                                                    onChange={(v) => setPriceDrafts((d) => ({ ...d, [p.id]: v }))} />
                                                                <button className="btn qui sm" type="button"
                                                                    disabled={!priceDrafts[p.id]}
                                                                    onClick={() => {
                                                                        act((s) => repost(s, p.id, priceDrafts[p.id]))
                                                                        setPriceDrafts((d) => {
                                                                            const next = { ...d }
                                                                            delete next[p.id]
                                                                            return next
                                                                        })
                                                                    }}>
                                                                    调价重挂
                                                                </button>
                                                                <button className="btn qui sm" type="button"
                                                                    onClick={() => act((s) => dropLine(s, p.id))}>
                                                                    退回
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </TableWrap>
                                </CardBody>
                                {(o.status === 'produced' || o.status === 'shipping') && (
                                    <CardFoot right={
                                        <>
                                            {o.status === 'produced' && (
                                                <button className="btn" type="button"
                                                    onClick={() => act((s) => deliver(s, o.id))}>
                                                    标记整单已交付
                                                </button>
                                            )}
                                            {o.paidAt ? (
                                                <Pill tone="ok" dot={false}>客户已回款 {o.paidAt.slice(0, 10)}</Pill>
                                            ) : (
                                                <button className="btn pri" type="button"
                                                    onClick={() => act((s) => custPaid(s, o.id))}>
                                                    登记客户回款
                                                </button>
                                            )}
                                        </>
                                    } />
                                )}
                        </>
                    </Card>
                )
            })}
        </Page>
    )
}
