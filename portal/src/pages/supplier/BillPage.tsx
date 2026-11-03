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
    const { state, act, t } = useMock()
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
            <Hello title={t.supplier.bill.title} />
            <Kpis>
                <Kpi k={t.supplier.bill.kpiCompleted} v={M(sum(done, (d) => d.total), 0)} d={t.supplier.bill.kpiCompletedSub(done.length)} />
                <Kpi k={t.supplier.bill.kpiPending} v={M(waiting, 0)} d={t.supplier.bill.kpiPendingSub} alert />
                <Kpi k={t.supplier.bill.kpiToInvoice} v={done.filter((d) => !d.invoice).length} d={t.supplier.bill.kpiToInvoiceSub} />
            </Kpis>

            {done.length ? done.map((d) => {
                const no = invNos[d.id] ?? ''
                return (
                    <Card key={d.id} style={{ marginBottom: 16 }}>
                        <CardHead
                            title={d.id}
                            rid={t.supplier.bill.cardSub(d.lines.length, M(d.total))}
                            right={d.invoice
                                ? <Pill tone="in">{t.supplier.bill.uploaded}</Pill>
                                : <Pill tone="wa">{t.supplier.bill.toInvoice}</Pill>}
                        />
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr>
                                        <th>{t.common.table.parts}</th><th className="n">{t.customer.quotes.colQty}</th><th className="n">{t.supplier.bill.colAmount}</th>
                                        <th>{t.supplier.bill.colPaid}</th><th>{t.supplier.bill.colDue}</th><th>{t.supplier.bill.colShipped}</th>
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
                                                        : <Pill tone="wa">{t.supplier.bill.pendingPayment}</Pill>}
                                                </td>
                                                <td>
                                                    {paid
                                                        ? <b>{dueDate(state, o)}</b>
                                                        : <span style={{ color: 'var(--muted)' }}>
                                                            {state.params.payDays != null
                                                                ? t.supplier.bill.dueAfter(state.params.payDays)
                                                                : t.supplier.bill.dueAfterPayment}
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
                                left={<span className="t2">{t.supplier.bill.invoiceNote(M(d.total))}</span>}
                                right={
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <Input value={no} placeholder={t.supplier.bill.invoiceNoPlaceholder}
                                            style={{ width: 140, padding: '5px 8px' }}
                                            onChange={(v) => setInvNos((x) => ({ ...x, [d.id]: v }))} />
                                        <button className="btn sm pri" type="button"
                                            onClick={() => act((s) => uploadInvoice(s, d.id, no))}>
                                            {t.supplier.bill.upload}
                                        </button>
                                    </div>
                                }
                            />
                        )}
                    </Card>
                )
            }) : (
                <Card><CardBody><Empty text={t.supplier.bill.empty} /></CardBody></Card>
            )}
        </Page>
    )
}
