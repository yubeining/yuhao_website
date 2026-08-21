import { Link, useNavigate } from 'react-router-dom'
import { Card, CardBody, Empty, Hello, Page, Pill, pill, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { sum } from '../../mock/format'
import { num } from '../../mock/params'
import { myRfqs } from '../../mock/selectors'
import { RFQ_ST } from './status'

export function RfqListPage() {
    const { state } = useMock()
    const navigate = useNavigate()
    const rfqs = myRfqs(state)

    return (
        <Page>
            <Hello
                title="我的询价"
                right={
                    <>
                        <Pill tone="ne" dot={false}>共 {rfqs.length} 单</Pill>
                        <Link className="btn pri" to="/customer/rfqs/new">＋ 提交新询价</Link>
                    </>
                }
            />
            <Card>
                {rfqs.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>询价单</th><th className="n">零件行数</th><th className="n">总件数</th>
                                    <th className="n">提交</th><th>状态</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {rfqs.map((r) => (
                                    <tr className="clk" key={r.id} onClick={() => navigate(`/customer/rfqs/${r.id}`)}>
                                        <td><span className="m">{r.id}</span></td>
                                        <td className="n">{r.lines.length}</td>
                                        <td className="n">{sum(r.lines, (l) => num(l.qty))}</td>
                                        <td className="n">{r.at.slice(0, 10)}</td>
                                        <td>{pill(RFQ_ST[r.status])}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--faint)' }}>›</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody>
                        <Empty text="还没有询价"
                            action={<Link className="btn pri" to="/customer/rfqs/new">＋ 提交新询价</Link>} />
                    </CardBody>
                )}
            </Card>
        </Page>
    )
}
