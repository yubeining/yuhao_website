/**
 * 派单管理 —— 一张订单怎么被拆成 N 个独立派单包，以及每个包现在什么下场。
 *
 * ★ 用缩进树而不是平铺表格：拆包关系是这一页要传达的**唯一**信息。
 *   平铺的话，「这 4 行来自同一张订单、各自独立成败」这件事就看不出来了。
 *
 * ★ 在挂的包有两个处置动作：
 *     调价重挂 —— 目标价上浮 5% 再挂一次（没人抢通常是价低了）
 *     退回该行 —— 放弃这一行，其余行照常成单
 *   两个都不可逆，但都不做二次确认：这是内部运营台，加确认框会拖慢日常操作。
 */

import { Card, CardBody, CardFoot, CardHead, Empty, Hello, Page, Pill, pill, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { custPaid, deliver, dropLine, findCompany, repost } from '../../mock/actions'
import { M, money } from '../../mock/format'
import { orderTotal, pkgsOf, quoteOf } from '../../mock/selectors'
import { ORD_ST } from '../customer/status'
import type { Pkg } from '../../mock/types'

const PKG_ST = (st: Pkg['status']) =>
    st === 'open' ? <Pill tone="in">在抢</Pill>
        : st === 'dropped' ? <Pill tone="ba">已退回</Pill>
            : st === 'done' ? <Pill tone="ok">已完工</Pill>
                : <Pill tone="ok">已抢</Pill>

export function OpsDispatchPage() {
    const { state, act } = useMock()
    const orders = state.db.orders.filter((o) => state.db.pkgs.some((p) => p.orderId === o.id))

    if (!orders.length) {
        return (
            <Page>
                <Hello title="派单管理" />
                <Card><CardBody><Empty text="还没有拆出派单包" /></CardBody></Card>
            </Page>
        )
    }

    return (
        <Page>
            <Hello title="派单管理" />
            {orders.map((o) => {
                const ps = pkgsOf(state, o.id)
                const locked = ps.filter((p) => p.status === 'taken' || p.status === 'done').length
                const q = quoteOf(state, o)
                return (
                    <Card key={o.id} style={{ marginBottom: 18 }}>
                        <CardHead
                            title={o.id}
                            rid={findCompany(state, o.companyId)?.name}
                            right={
                                <>
                                    <Pill tone={locked === ps.length ? 'ok' : 'wa'}>
                                        {locked} / {ps.length} 行已锁定
                                    </Pill>
                                    {pill(ORD_ST[o.status])}
                                </>
                            }
                        />
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr>
                                        <th>行 / 派单号</th><th>零件</th><th className="n">数量</th>
                                        <th className="n">目标价</th><th>付款周期</th><th>状态</th>
                                        <th>供应商</th><th />
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="trow">
                                        <td colSpan={4}>
                                            <span className="m">{q?.rfqId}</span> · 对客 {money(orderTotal(state, o))}
                                        </td>
                                        <td colSpan={4}>
                                            拆成 <b>{ps.length}</b> 个派单包，各自独立抢单
                                        </td>
                                    </tr>
                                    {ps.map((p) => (
                                        <tr key={p.id} className={p.status === 'dropped' ? 'dim' : ''}>
                                            <td>
                                                <span className="kid">└</span><span className="m">{p.id}</span>
                                                <div className="t2" style={{ marginLeft: 15 }}>第 {p.line + 1} 行</div>
                                            </td>
                                            {/* ★ 内部可以看客户图号，从订单行回溯 ——
                                                派单包里刻意不存它，见 mock/types.ts 的 partName */}
                                            <td>
                                                <div className="t1">{p.partName}</div>
                                                <div className="t2">
                                                    {o.items[p.line]?.no} · {p.mat} · {p.surf}
                                                </div>
                                            </td>
                                            <td className="n">{p.qty}</td>
                                            <td className="n">
                                                <b>¥ {M(p.target)}</b>
                                                {p.reprice ? <div className="t2">已调价 {p.reprice} 次</div> : null}
                                            </td>
                                            <td>{p.pay}</td>
                                            <td>{PKG_ST(p.status)}</td>
                                            <td>
                                                {p.sup
                                                    ? findCompany(state, p.sup)?.name
                                                    : <span style={{ color: 'var(--faint)' }}>—</span>}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                {p.status === 'open' && (
                                                    <>
                                                        <button className="btn qui sm" type="button"
                                                            onClick={() => act((s) => repost(s, p.id))}>
                                                            调价重挂
                                                        </button>
                                                        <button className="btn qui sm" type="button"
                                                            onClick={() => act((s) => dropLine(s, p.id))}>
                                                            退回该行
                                                        </button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        </CardBody>

                        {(o.status === 'confirmed' || o.status === 'delivered') && (
                            <CardFoot right={
                                <>
                                    {o.status === 'confirmed' && (
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
                    </Card>
                )
            })}
        </Page>
    )
}
