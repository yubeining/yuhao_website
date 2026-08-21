/**
 * 单个零件行的详情。客户看得到图纸、规格、单价和这一行自己的生产进度。
 *
 * ★ 图纸文件从文件库来。上传接口没做，所以现在这一格是空的 ——
 *   不放示意图形，见 components/brand.tsx。
 */

import { Link, Navigate, useParams } from 'react-router-dom'
import { DrawingPanel } from '../../components/brand'
import {
    Bar, BarLabel, Card, CardBody, CardFoot, CardHead, Cols, Fields, Fld, Hello,
    Page, pill, Stack, Timeline,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { money } from '../../mock/format'
import { num } from '../../mock/params'
import { myOrders } from '../../mock/selectors'
import { IT_ST, LINE_STAGES } from './status'

export function OrderLinePage() {
    const { state } = useMock()
    const { id, idx } = useParams()
    const order = myOrders(state).find((o) => o.id === id)
    const i = Number(idx)
    const item = order && Number.isInteger(i) ? order.items[i] : undefined
    if (!order || !item) return <Navigate to="/customer/orders" replace />

    const pct = Math.round((num(item.done) / Math.max(1, num(item.qty))) * 100)

    return (
        <Page>
            <Hello
                back={
                    <Link className="btn sm qui" to={`/customer/orders/${order.id}`} style={{ margin: '0 0 6px -9px' }}>
                        ← 订单详情
                    </Link>
                }
                title={item.no} sub={`${order.id} · 第 ${i + 1} 行`}
                right={pill(IT_ST[item.st], IT_ST.pending)}
            />
            <Cols>
                <Stack>
                    <Card>
                        <CardHead title="零件信息" rid={`Rev ${item.rev}`} />
                        <CardBody>
                            <Cols style={{ gridTemplateColumns: 'minmax(0,.85fr) minmax(0,1.3fr)' }}>
                                <DrawingPanel files={[]} />
                                <Fields>
                                    <Fld k="零件号" v={item.no} />
                                    <Fld k="图纸版本" v={item.rev} mono />
                                    <Fld k="材料" v={item.mat} />
                                    <Fld k="表面处理" v={item.surf} />
                                    <Fld k="数量" v={item.qty} mono />
                                    <Fld k="交付方式" v={item.ship} />
                                    <Fld k="单价" v={money(item.unit)} mono />
                                    <Fld k="小计" v={money(item.total)} mono />
                                </Fields>
                            </Cols>
                        </CardBody>
                        <CardFoot right={
                            <>
                                <button className="btn" type="button">下载图纸 STEP</button>
                                <button className="btn" type="button">下载图纸 PDF</button>
                            </>
                        } />
                    </Card>
                </Stack>

                <Stack>
                    <Card>
                        <CardHead title="生产进度" />
                        <CardBody>
                            <BarLabel left={<>已完成 <b>{item.done} / {item.qty}</b></>} />
                            <div style={{ marginBottom: 18 }}><Bar pct={pct} /></div>
                            <Timeline stages={LINE_STAGES} cur={item.stage || 0} />
                        </CardBody>
                    </Card>
                </Stack>
            </Cols>
        </Page>
    )
}
