/**
 * 对账与开票。
 *
 * ★ 这一页的重点是把**背靠背结算**讲透：应付日不是「交付后 T+N」，
 *   而是「客户回款后 T+N」。客户没付款，这一栏就明写「待回款」而不是给个日期。
 *   给假日期比不给更糟 —— 供应商会照着它排现金流。
 *
 * ★★ 一个生产订单可能装着几个客户的零件，**回款是按行看的**：
 *   哪个客户付了，哪一行才有应付日。整单给一个日期是编的 ——
 *   那几个客户各付各的，没有一个共同的时刻。
 *
 * ★ 发票仍然是整单一张：合同一单一份，票跟着合同走。
 */

import { useState } from 'react'
import { Input } from '../../components/form'
import {
    Card, CardBody, CardFoot, CardHead, Empty, Hello, Kpi, Kpis, Page, Pill, PrototypeBanner, TableWrap,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { dueDate, uploadInvoice } from '../../mock/actions'
import { M, X, sum } from '../../mock/format'
import { myProds } from '../../mock/selectors'

export function BillPage() {
    const { state, act } = useMock()
    const [invNos, setInvNos] = useState<Record<string, string>>({})

    const done = myProds(state).filter((d) => d.status === 'done')
    const orderOf = (soId: string) => state.db.orders.find((o) => o.id === soId)
    /** 还没等到客户回款的行的金额 —— 按行算，不按单算 */
    const waiting = sum(
        done.flatMap((d) => d.lines).filter((l) => !orderOf(l.orderId)?.paidAt),
        (l) => l.total,
    )

    return (
        <Page>
            <PrototypeBanner />
            <Hello title="对账与开票" />
            <Kpis>
                <Kpi k="已完工金额" v={M(sum(done, (d) => d.total), 0)} d={`元 · ${done.length} 单`} />
                <Kpi k="待客户回款" v={M(waiting, 0)} d="元 · 背靠背顺延" alert />
                <Kpi k="待开票" v={done.filter((d) => !d.invoice).length} d="单" />
            </Kpis>

            {done.length ? done.map((d) => {
                const no = invNos[d.id] ?? ''
                return (
                    <Card key={d.id} style={{ marginBottom: 16 }}>
                        <CardHead
                            title={d.id}
                            rid={`${d.lines.length} 行 · ¥ ${M(d.total)}`}
                            right={d.invoice
                                ? <Pill tone="in">已上传待核验</Pill>
                                : <Pill tone="wa">待开票</Pill>}
                        />
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr>
                                        <th>零件</th><th className="n">数量</th><th className="n">金额</th>
                                        <th>客户回款</th><th>应付日</th><th>发货</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {d.lines.map((l) => {
                                        const o = orderOf(l.orderId)
                                        const paid = o?.paidAt
                                        return (
                                            <tr key={l.partId}>
                                                {/* ★ 仍然不显示图号和客户是谁 —— 供应商这一侧从头到尾都不该看到 */}
                                                <td className="t1">{l.partName}</td>
                                                <td className="n">{l.qty}</td>
                                                <td className="n"><b>¥ {M(l.total)}</b></td>
                                                <td>
                                                    {paid
                                                        ? <Pill tone="ok">{paid.slice(0, 10)}</Pill>
                                                        : <Pill tone="wa">待回款</Pill>}
                                                </td>
                                                <td>
                                                    {paid
                                                        ? <b>{dueDate(state, o)}</b>
                                                        : <span style={{ color: 'var(--muted)' }}>
                                                            {state.params.payDays != null
                                                                ? `客户回款后 T+${state.params.payDays} 天`
                                                                : '客户回款后支付'}
                                                        </span>}
                                                </td>
                                                <td>{l.delivered ? l.delivered.slice(0, 10) : X}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </TableWrap>
                        </CardBody>
                        {!d.invoice && (
                            <CardFoot
                                left={<span className="t2">整单开一张票，金额 ¥ {M(d.total)}</span>}
                                right={
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <Input value={no} placeholder="发票号"
                                            style={{ width: 140, padding: '5px 8px' }}
                                            onChange={(v) => setInvNos((x) => ({ ...x, [d.id]: v }))} />
                                        <button className="btn sm pri" type="button"
                                            onClick={() => act((s) => uploadInvoice(s, d.id, no))}>
                                            上传
                                        </button>
                                    </div>
                                }
                            />
                        )}
                    </Card>
                )
            }) : (
                <Card><CardBody><Empty text="还没有完工待结算的订单" /></CardBody></Card>
            )}
        </Page>
    )
}
