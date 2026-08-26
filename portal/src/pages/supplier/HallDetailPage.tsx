/**
 * 生产订单详情 —— 抢单前唯一能看到的完整信息。
 *
 * ★★ 挂出来的是**我方组好的一批活**，不是某个客户的订单。
 *   一单可能装着几个客户的零件，但这一层看不出来 ——
 *   看到的只有零件名、材料、数量，**没有图号，也没有客户是谁**。
 *
 * ★ 订单市场对所有已入驻供应商开放，包括还没签这一单合同的人。
 *   所以终端客户身份、原始图纸、对客价格都不能出现在这一层。
 *
 *   ★★ 脱敏动作本身还没实现。在实现之前，界面上**不许**出现「已脱敏」标记 ——
 *   那是一句承诺，不是一个状态。标了而没做，等于对客户和供应商同时撒谎。
 *
 * ★ 目标价不可议价，且必须把背靠背付款条款摆在抢单按钮旁边。
 *   供应商事后才发现「客户不付我就拿不到钱」，这个平台就没有第二次合作。
 *
 * ★ 整单抢走，不能只挑其中几行 —— 一个生产订单一个供应商（设计文档 3 §2.4）。
 *   所以按钮旁边要写清楚抢的是几行、共多少件。
 */

import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { DrawingPanel } from '../../components/brand'
import {
    Banner, Card, CardBody, CardHead, Cols, Hello, Kv, KvRow, Page, Pill, Stack, TableWrap,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { canGrab, grab } from '../../mock/actions'
import { M, X, hoursLeft } from '../../mock/format'

export function HallDetailPage() {
    const { state, actWith } = useMock()
    const navigate = useNavigate()
    const { id } = useParams()
    const p = state.db.prods.find((x) => x.id === id)
    if (!p) return <Navigate to="/supplier/hall" replace />

    const grabbable = canGrab(state)
    const left = hoursLeft(p.exp)
    const qty = p.lines.reduce((a, l) => a + l.qty, 0)
    const leads = [...new Set(p.lines.map((l) => l.wantLead))]

    const onGrab = () => {
        const err = actWith((s) => grab(s, p.id))
        if (!err) navigate('/supplier/won')
    }

    return (
        <Page>
            <Hello
                back={<Link className="btn sm qui" to="/supplier/hall" style={{ margin: '0 0 6px -9px' }}>← 订单市场</Link>}
                title={`${p.lines.length} 个零件 · 共 ${qty} 件`}
                sub={[...new Set(p.lines.map((l) => l.mat).filter(Boolean))].join(' · ') || '材料未定'}
                right={
                    <>
                        <span className="rid">{p.id}</span>
                        <Pill tone="wa">{left === 0 ? '已超时' : `剩 ${left} 小时`}</Pill>
                    </>
                }
            />

            {p.status !== 'open' && (
                <Banner tone="wa" style={{ marginBottom: 16 }}>
                    这个生产订单已经被抢走了。
                </Banner>
            )}

            <Cols>
                <Stack>
                    <Card>
                        <CardHead title="零件清单" rid={`${p.lines.length} 行`} />
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr>
                                        <th>零件</th><th>材料</th><th>表面处理</th>
                                        <th className="n">数量</th><th className="n">单件</th><th className="n">小计</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {p.lines.map((l) => (
                                        <tr key={l.partId}>
                                            {/* ★ 只有零件名和版本标记，没有图号 —— 图号是客户自己的编码体系 */}
                                            <td className="t1">
                                                {l.partName}
                                                {l.rev ? <div className="t2 m">Rev {l.rev}</div> : null}
                                            </td>
                                            <td>{l.mat || X}</td>
                                            <td>{l.surf || X}</td>
                                            <td className="n">{l.qty}</td>
                                            <td className="n">¥ {M(l.target)}</td>
                                            <td className="n">¥ {M(l.total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        </CardBody>
                    </Card>

                    <Card>
                        <CardHead title="图纸与技术要求" />
                        <CardBody>
                            {/* ★ 图纸文件从文件库来，上传接口没做，现在一律空。
                                绝不放示意图形 —— 供应商会照着它估工时和装夹。 */}
                            <DrawingPanel files={[]} />
                        </CardBody>
                    </Card>

                    <Card>
                        <CardHead title="商务条款" />
                        <CardBody>
                            <Kv>
                                {/* ★ 各行的客户交期可能不同，不同就明说，不挑一个当代表 */}
                                <KvRow k="客户要求交期" v={leads.length === 1 ? leads[0] : '按行不同，见清单'} sans />
                                <KvRow k="付款周期" v={<b>{p.pay}</b>} sans />
                            </Kv>
                            <Banner tone="wa" style={{ marginTop: 15 }}>
                                付款以融一智造收到终端客户货款为前提，客户未付则顺延。抢单即视为接受该条款。
                            </Banner>
                        </CardBody>
                    </Card>
                </Stack>

                <Stack>
                    <Card>
                        <CardHead title="目标价" right={<Pill tone="ne">不可议价</Pill>} />
                        <CardBody>
                            {/* ★ 整单一口价。**不给平均单价** —— 各行单价本来就不同，
                                平均出来的数不对应任何一件东西，看的人会拿它去估成本。 */}
                            <div className="pbox acc">
                                <div className="pk">整单</div>
                                <div className="pv">¥ {M(p.total)}</div>
                                <div className="ps">{p.lines.length} 行 · 共 {qty} 件 · 含税</div>
                            </div>
                            <button className="btn pri" type="button"
                                style={{ width: '100%', marginTop: 14, padding: 11 }}
                                disabled={!grabbable || p.status !== 'open'}
                                onClick={onGrab}>
                                {grabbable ? `整单抢下（${p.lines.length} 行）` : '资质考察后可抢'}
                            </button>
                            <div className="t2" style={{ marginTop: 8, lineHeight: 1.6 }}>
                                整单抢走，不能只做其中几行。
                            </div>
                            <Link className="btn" to="/supplier/hall"
                                style={{ width: '100%', marginTop: 8, display: 'block', textAlign: 'center' }}>
                                放弃
                            </Link>
                        </CardBody>
                    </Card>
                </Stack>
            </Cols>
        </Page>
    )
}
