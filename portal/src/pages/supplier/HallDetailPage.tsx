/**
 * 派单包详情 —— 抢单前唯一能看到的完整信息。
 *
 * ★ 订单市场对所有已入驻供应商开放，包括还没签这一单合同的人。
 *   所以终端客户身份、原始图纸、对客价格都不能出现在这一层。
 *
 *   ★★ 脱敏动作本身还没实现。在实现之前，界面上**不许**出现「已脱敏」标记 ——
 *   那是一句承诺，不是一个状态。标了而没做，等于对客户和供应商同时撒谎。
 *
 * ★ 目标价不可议价，且必须把背靠背付款条款摆在抢单按钮旁边。
 *   供应商事后才发现「客户不付我就拿不到钱」，这个平台就没有第二次合作。
 */

import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { DrawingPanel } from '../../components/brand'
import {
    Banner, Card, CardBody, CardHead, Cols, Fields, Fld, Hello, Kv, KvRow, Page, Pill, Stack,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { canGrab, grab } from '../../mock/actions'
import { M, hoursLeft } from '../../mock/format'

export function HallDetailPage() {
    const { state, actWith } = useMock()
    const navigate = useNavigate()
    const { id } = useParams()
    const p = state.db.pkgs.find((x) => x.id === id)
    if (!p) return <Navigate to="/supplier/hall" replace />

    const grabbable = canGrab(state)
    const left = hoursLeft(p.exp)

    const onGrab = () => {
        const err = actWith((s) => grab(s, p.id))
        if (!err) navigate('/supplier/won')
    }

    return (
        <Page>
            <Hello
                back={<Link className="btn sm qui" to="/supplier/hall" style={{ margin: '0 0 6px -9px' }}>← 订单市场</Link>}
                title={`${p.partName} × ${p.qty}`}
                sub={`${p.mat} · ${p.surf} · Rev ${p.rev}`}
                right={
                    <>
                        <span className="rid">{p.id}</span>
                        <Pill tone="wa">{left === 0 ? '已超时' : `剩 ${left} 小时`}</Pill>
                    </>
                }
            />

            {p.status !== 'open' && (
                <Banner tone="wa" style={{ marginBottom: 16 }}>
                    这个派单包已经被抢走了。
                </Banner>
            )}

            <Cols>
                <Stack>
                    <Card>
                        <CardHead title="图纸与技术要求" />
                        <CardBody>
                            <Cols style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)' }}>
                                <DrawingPanel files={[]} />
                                <Fields>
                                    <Fld k="零件名称" v={p.partName} />
                                    <Fld k="图纸版本" v={p.rev} mono />
                                    <Fld k="材料" v={p.mat} />
                                    <Fld k="表面处理" v={p.surf} />
                                    <Fld k="数量" v={p.qty} mono />
                                </Fields>
                            </Cols>
                        </CardBody>
                    </Card>

                    <Card>
                        <CardHead title="商务条款" />
                        <CardBody>
                            <Kv>
                                <KvRow k="客户要求交期" v={p.wantLead} sans />
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
                            <div className="pbox acc">
                                <div className="pk">单件</div>
                                <div className="pv">¥ {M(p.target)}</div>
                                <div className="ps">合计 ¥ {M(p.total)} · 含税</div>
                            </div>
                            <button className="btn pri" type="button"
                                style={{ width: '100%', marginTop: 14, padding: 11 }}
                                disabled={!grabbable || p.status !== 'open'}
                                onClick={onGrab}>
                                {grabbable ? '立即抢单' : '资质考察后可抢'}
                            </button>
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
