import { Card, CardBody, Empty, Hello, Page, Pill, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { findCompany } from '../../mock/actions'
import { sum } from '../../mock/format'
import { num } from '../../mock/params'

export function OpsRfqsPage() {
    const { state } = useMock()
    const rfqs = state.db.rfqs

    return (
        <Page>
            <Hello title="询价单" right={<Pill tone="ne" dot={false}>共 {rfqs.length} 单</Pill>} />
            <Card>
                {rfqs.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>询价单</th><th>客户</th><th className="n">行数</th>
                                    <th className="n">总件数</th><th className="n">提交</th><th>报价</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rfqs.map((r) => (
                                    <tr className="clk" key={r.id}>
                                        <td><span className="m">{r.id}</span></td>
                                        <td className="t1">{findCompany(state, r.companyId)?.name}</td>
                                        <td className="n">{r.lines.length}</td>
                                        <td className="n">{sum(r.lines, (l) => num(l.qty))}</td>
                                        <td className="n">{r.at}</td>
                                        <td>
                                            {r.quoteId
                                                ? <span className="m">{r.quoteId}</span>
                                                : <Pill tone="ne">未报价</Pill>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text="还没有询价单" /></CardBody>
                )}
            </Card>
        </Page>
    )
}
