/**
 * 我的报价 —— 待确认和已确认的。
 *
 * ★ 待确认的价格按最新汇率现算，每天会变；列表上写明汇率日期，确认时锁定（2026-09-17 拍板）。
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardBody, Empty, Hello, Page, pill, TableWrap } from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { fmtDateTime, fmtMoney, X } from '../../mock/format'
import { listMyQuotes, type CustomerQuoteSummaryView } from '../../services'
import { quoteSt } from './status'

export function QuoteListPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const [quotes, setQuotes] = useState<CustomerQuoteSummaryView[] | null>(null)
    const [err, setErr] = useState<string | null>(null)

    const load = useCallback(async () => {
        try {
            setQuotes((await listMyQuotes(1, 100)).items)
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])

    useEffect(() => { void load() }, [load])

    return (
        <Page>
            <Hello title={t.customer.quotes.title} />
            <Card>
                {quotes === null ? (
                    <CardBody>
                        {err
                            ? <Empty text={err} action={<button className="btn" type="button" onClick={() => void load()}>{t.common.retry}</button>} />
                            : <Empty text={t.common.loading} />}
                    </CardBody>
                ) : quotes.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>{t.common.table.order}</th><th className="n">{t.common.table.totalPrice}</th><th>{t.common.table.price}</th>
                                    <th className="n">{t.common.table.leadTime}</th><th className="n">{t.common.table.quotedAt}</th><th>{t.common.table.status}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {quotes.map((q) => (
                                    <tr className="clk" key={q.id} onClick={() => navigate(`/customer/quotes/${q.orderId}`)}>
                                        <td className="t1">{q.orderTitle || t.common.untitledOrder}</td>
                                        <td className="n"><b>{fmtMoney(q.total, q.currency)}</b></td>
                                        <td className="t2">
                                            {q.priceLocked
                                                ? t.customer.quotes.locked(q.rateDate ?? X)
                                                : q.rateDate
                                                    ? t.customer.quotes.floating(q.rateDate)
                                                    : t.customer.quotes.noRate}
                                        </td>
                                        <td className="n">{t.customer.quotes.afterConfirm(q.leadDays)}</td>
                                        <td className="n">{fmtDateTime(new Date(q.sentAt))}</td>
                                        <td>{pill(quoteSt(t)[q.status])}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody>
                        <Empty text={t.customer.quotes.empty} sub={t.customer.quotes.emptySub} />
                    </CardBody>
                )}
            </Card>
        </Page>
    )
}
