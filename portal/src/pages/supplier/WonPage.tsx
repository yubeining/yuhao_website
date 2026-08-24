/**
 * 我抢到的 —— 抢到之后、签合同之前的中间状态。
 *
 * ★ 抢到不等于可以开工：合同要签。没签的包在「我的订单」里不出现，
 *   逼着人先把合同签掉，而不是先开机器再补手续。
 */

import { Link } from 'react-router-dom'
import { Card, CardBody, Empty, Hello, Page, Pill, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { sign } from '../../mock/actions'
import { M } from '../../mock/format'
import { contractOf, myPkgs } from '../../mock/selectors'

export function WonPage() {
    const { state, act } = useMock()
    const pkgs = myPkgs(state)

    return (
        <Page>
            <Hello title="我抢到的" right={<Pill tone="ne" dot={false}>共 {pkgs.length} 个</Pill>} />
            <Card>
                {pkgs.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>派单号</th><th>零件</th><th className="n">数量</th><th className="n">金额</th>
                                    <th className="n">抢单时间</th><th>合同</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {pkgs.map((p) => {
                                    const ct = contractOf(state, p.id)
                                    const signed = ct?.status === 'signed'
                                    return (
                                        <tr key={p.id}>
                                            <td><span className="m">{p.id}</span></td>
                                            <td className="t1">{p.partName}</td>
                                            <td className="n">{p.qty}</td>
                                            <td className="n"><b>¥ {M(p.total)}</b></td>
                                            <td className="n">{p.tookAt}</td>
                                            <td>
                                                {signed ? <Pill tone="ok">已签署</Pill> : <Pill tone="wa">待签署</Pill>}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                {signed ? (
                                                    <button className="btn sm" type="button">看合同</button>
                                                ) : (
                                                    <button className="btn sm pri" type="button"
                                                        onClick={() => ct && act((s) => sign(s, ct.id))}>
                                                        签署合同
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody>
                        <Empty text="还没抢到派单包"
                            action={<Link className="btn pri" to="/supplier/hall">去订单市场</Link>} />
                    </CardBody>
                )}
            </Card>
        </Page>
    )
}
