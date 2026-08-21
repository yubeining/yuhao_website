import { useNavigate } from 'react-router-dom'
import { Card, CardBody, Empty, Hello, Page, Pill, pill, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { money, sum } from '../../mock/format'
import { num } from '../../mock/params'
import { myQuotes } from '../../mock/selectors'
import { QT_ST } from './status'

export function QuoteListPage() {
    const { state } = useMock()
    const navigate = useNavigate()
    const quotes = myQuotes(state)
    const open = quotes.filter((q) => q.status === 'open').length

    return (
        <Page>
            <Hello title="我的报价" right={<Pill tone="in">{open} 份待确认</Pill>} />
            <Card>
                {quotes.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>报价单</th><th className="n">零件行数</th><th className="n">总件数</th>
                                    <th className="n">总价</th><th>贸易条款</th><th className="n">有效期至</th>
                                    <th>状态</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {quotes.map((q) => (
                                    <tr className="clk" key={q.id} onClick={() => navigate(`/customer/quotes/${q.id}`)}>
                                        <td><span className="m">{q.id}</span></td>
                                        <td className="n">{q.items.length}</td>
                                        <td className="n">{sum(q.items, (i) => num(i.qty))}</td>
                                        <td className="n"><b>{money(q.total)}</b></td>
                                        <td>{q.inco}</td>
                                        <td className="n">{q.valid}</td>
                                        <td>{pill(QT_ST[q.status])}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--faint)' }}>›</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text="还没有报价" /></CardBody>
                )}
            </Card>
        </Page>
    )
}
