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
import { QUOTE_ST } from './status'

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
            <Hello title="我的报价" />
            <Card>
                {quotes === null ? (
                    <CardBody>
                        {err
                            ? <Empty text={err} action={<button className="btn" type="button" onClick={() => void load()}>重试</button>} />
                            : <Empty text="加载中…" />}
                    </CardBody>
                ) : quotes.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>订单</th><th className="n">总价</th><th>价格</th>
                                    <th className="n">交期</th><th className="n">报价时间</th><th>状态</th>
                                </tr>
                            </thead>
                            <tbody>
                                {quotes.map((q) => (
                                    <tr className="clk" key={q.id} onClick={() => navigate(`/customer/quotes/${q.orderId}`)}>
                                        <td className="t1">{q.orderTitle || '未命名订单'}</td>
                                        <td className="n"><b>{fmtMoney(q.total, q.currency)}</b></td>
                                        <td className="t2">
                                            {q.priceLocked
                                                ? `已锁定（汇率日期 ${q.rateDate ?? X}）`
                                                : q.rateDate
                                                    ? `按 ${q.rateDate} 汇率，确认前会变`
                                                    : '暂时取不到汇率，价格稍后显示'}
                                        </td>
                                        <td className="n">确认后 {q.leadDays} 天</td>
                                        <td className="n">{fmtDateTime(new Date(q.sentAt))}</td>
                                        <td>{pill(QUOTE_ST[q.status])}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody>
                        <Empty text="暂无报价" sub="订单提交后，平台报价会出现在这里" />
                    </CardBody>
                )}
            </Card>
        </Page>
    )
}
