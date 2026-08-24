/**
 * 对账与开票。
 *
 * ★ 这一页的重点是把**背靠背结算**讲透：应付日不是「交付后 T+N」，
 *   而是「客户回款后 T+N」。客户没付款，这一栏就明写「待回款」而不是给个日期。
 *   给假日期比不给更糟 —— 供应商会照着它排现金流。
 */

import { useState } from 'react'
import { Input } from '../../components/form'
import { Card, CardBody, Empty, Hello, Kpi, Kpis, Page, Pill, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { dueDate, uploadInvoice } from '../../mock/actions'
import { M, sum } from '../../mock/format'
import { myPkgs } from '../../mock/selectors'

export function BillPage() {
    const { state, act } = useMock()
    const [invNos, setInvNos] = useState<Record<string, string>>({})

    const done = myPkgs(state).filter((p) => p.status === 'done')
    const orderOf = (soId: string) => state.db.orders.find((o) => o.id === soId)
    const waiting = sum(done.filter((p) => !orderOf(p.orderId)?.paidAt), (p) => p.total)

    return (
        <Page>
            <Hello title="对账与开票" />
            <Kpis>
                <Kpi k="已完工金额" v={M(sum(done, (p) => p.total), 0)} d={`元 · ${done.length} 单`} />
                <Kpi k="待客户回款" v={M(waiting, 0)} d="元 · 背靠背顺延" alert />
                <Kpi k="待开票" v={done.filter((p) => !p.invoice).length} d="单" />
            </Kpis>

            <Card>
                {done.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>派单号</th><th>零件</th><th className="n">数量</th><th className="n">金额</th>
                                    <th>客户回款</th><th>应付日</th><th>发票</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {done.map((p) => {
                                    const o = orderOf(p.orderId)
                                    const paid = o?.paidAt
                                    const no = invNos[p.id] ?? ''
                                    return (
                                        <tr key={p.id}>
                                            <td><span className="m">{p.id}</span></td>
                                            <td className="t1">{p.partName}</td>
                                            <td className="n">{p.qty}</td>
                                            <td className="n"><b>¥ {M(p.total)}</b></td>
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
                                            <td>
                                                {p.invoice
                                                    ? <Pill tone="in">已上传待核验</Pill>
                                                    : <Pill tone="wa">待开票</Pill>}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                {!p.invoice && (
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <Input value={no} placeholder="发票号"
                                                            style={{ width: 120, padding: '5px 8px' }}
                                                            onChange={(v) => setInvNos((d) => ({ ...d, [p.id]: v }))} />
                                                        <button className="btn sm pri" type="button"
                                                            onClick={() => act((s) => uploadInvoice(s, p.id, no))}>
                                                            上传
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text="还没有完工待结算的订单" /></CardBody>
                )}
            </Card>
        </Page>
    )
}
