/**
 * 订单详情 —— 草稿里加零件、每个零件传自己的图纸，传齐后提交。
 *
 * ★ 提交条件（2026-09-14 拍板）：每个零件行都要有至少一份传完的图纸。
 * ★ 提交时锁定各行的图纸版本，之后这张订单不能再改。
 * ★ 提交之后这里只写「已提交、图纸已锁定」这一个事实 —— 不承诺报价时间：
 *   运营端还没接上真订单（第 3 步），写「平台估价中」就是一句没有依据的承诺（CLAUDE.md §10 C5）。
 */

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Input } from '../../components/form'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Empty, Fields, Fld, Hello, Page, Pill, pill, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { fmtDate, fmtDateTime, X } from '../../mock/format'
import {
    ApiError, getOrder, removeLine, submitOrder, updateOrder, type OrderView,
} from '../../services'
import { ORDER_ST } from './status'

export function OrderDetailPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const { id = '' } = useParams()
    const [order, setOrder] = useState<OrderView | null>(null)
    const [missing, setMissing] = useState(false)
    const [title, setTitle] = useState('')
    const [lead, setLead] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const apply = (o: OrderView) => {
        setOrder(o)
        setTitle(o.title ?? '')
        setLead(o.wantedLeadDays ? String(o.wantedLeadDays) : '')
    }

    const load = useCallback(async () => {
        try {
            apply(await getOrder(id))
        } catch (e) {
            if (e instanceof ApiError && e.code === 404) setMissing(true)
            else setErr(errorText(t, e))
        }
    }, [id, t])

    useEffect(() => { void load() }, [load])

    if (missing) {
        return (
            <Page>
                <Card><CardBody>
                    <Empty text="订单不存在" action={<Link className="btn" to="/customer/orders">← 我的订单</Link>} />
                </CardBody></Card>
            </Page>
        )
    }
    if (!order) return <Page><Card><CardBody><Empty text="加载中…" /></CardBody></Card></Page>

    const draft = order.status === 'DRAFT'
    const noDrawing = order.lines.filter((l) => l.revision.files.length === 0).length
    const totalQty = order.lines.reduce((a, l) => a + l.quantity, 0)
    const canSubmit = draft && order.lines.length > 0 && noDrawing === 0

    const saveDraftInfo = async () => {
        const days = lead.trim() ? Number(lead.trim()) : null
        if (days !== null && (!Number.isInteger(days) || days <= 0)) {
            setErr('期望交期请填正整数天数')
            return
        }
        // 后端不输出 null 字段，拿到的是 undefined —— 统一成 null 再比，否则每次失焦都会多发一次保存
        if ((title.trim() || null) === (order.title ?? null) && days === (order.wantedLeadDays ?? null)) return
        try {
            apply(await updateOrder(order.id, { title: title.trim() || null, wantedLeadDays: days }))
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }

    const submit = async () => {
        setBusy(true)
        try {
            apply(await submitOrder(order.id))
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
            await load()
        } finally {
            setBusy(false)
        }
    }

    const remove = async (lineId: string) => {
        try {
            await removeLine(order.id, lineId)
            await load()
        } catch (e) {
            setErr(errorText(t, e))
        }
    }

    return (
        <Page>
            <Hello
                back={<Link className="btn sm qui" to="/customer/orders" style={{ margin: '0 0 6px -9px' }}>← 我的订单</Link>}
                title={order.title || '未命名订单'}
                right={
                    <>
                        {pill(ORDER_ST[order.status])}
                        {draft && <Link className="btn pri" to={`/customer/orders/${order.id}/parts/new`}>＋ 添加零件</Link>}
                    </>
                }
            />

            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {draft && noDrawing > 0 && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>{noDrawing} 个零件还没传图纸，传齐后才能提交。</Banner>
            )}
            {order.status === 'SUBMITTED' && (
                <Banner tone="in" style={{ marginBottom: 14 }}>订单已提交，各零件的图纸版本已锁定，不能再修改。</Banner>
            )}
            {order.status === 'CANCELLED' && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>订单已取消。</Banner>
            )}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title="订单信息" />
                <CardBody>
                    <Fields>
                        <Fld k="名称" v={draft
                            ? <Input value={title} placeholder="订单名称" onChange={setTitle} onBlur={saveDraftInfo} />
                            : (order.title || X)} />
                        <Fld k="期望交期" v={draft
                            ? <Input value={lead} placeholder="天（仅供参考）" onChange={setLead} onBlur={saveDraftInfo} />
                            : (order.wantedLeadDays ? `${order.wantedLeadDays} 天（仅供参考）` : X)} />
                        <Fld k="零件数" v={order.lines.length} mono />
                        <Fld k="总件数" v={totalQty} mono />
                        {/* ★ 后端给的是 UTC 的 ISO 字符串，必须转成本地时区再显示，不能直接截字符串（CLAUDE.md §4） */}
                        <Fld k="建单日期" v={fmtDate(new Date(order.createdAt))} mono />
                        <Fld k="提交时间" v={order.submittedAt ? fmtDateTime(new Date(order.submittedAt)) : X} mono />
                    </Fields>
                </CardBody>
            </Card>

            <Card>
                <CardHead
                    title={`零件 ${order.lines.length} 个`}
                    right={draft && noDrawing > 0 ? <Pill tone="wa">{noDrawing} 缺图纸</Pill> : undefined}
                />
                {order.lines.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th className="n">#</th><th>图号</th><th>名称</th><th>版本</th><th>材料</th>
                                    <th className="n">数量</th><th className="n">图纸</th><th>状态</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {order.lines.map((l, i) => (
                                    <tr key={l.id} className="clk" onClick={() => navigate(`/customer/orders/${order.id}/parts/${l.id}`)}>
                                        <td className="n">{i + 1}</td>
                                        <td><span className="m">{l.code}</span></td>
                                        <td className="t1">{l.partName}</td>
                                        <td>
                                            <span className="m">v{l.revision.revNo}</span>
                                            {l.revision.customerRev && <div className="t2">客户标记 {l.revision.customerRev}</div>}
                                        </td>
                                        <td>{l.material || X}</td>
                                        <td className="n">{l.quantity}</td>
                                        <td className="n">{l.revision.files.length || X}</td>
                                        <td>{l.revision.files.length ? <Pill tone="ok">图纸已传</Pill> : <Pill tone="wa">缺图纸</Pill>}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            {draft
                                                ? <button className="btn qui sm" type="button"
                                                    onClick={(e) => { e.stopPropagation(); void remove(l.id) }}>删除</button>
                                                : <span style={{ color: 'var(--faint)' }}>›</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody>
                        <Empty text="暂无零件" sub="录入零件并传好图纸后提交"
                            action={draft ? <Link className="btn pri" to={`/customer/orders/${order.id}/parts/new`}>＋ 录入零件</Link> : undefined} />
                    </CardBody>
                )}
                {draft && order.lines.length > 0 && (
                    <CardFoot
                        left={<Link className="btn" to={`/customer/orders/${order.id}/parts/new`}>＋ 添加零件</Link>}
                        right={
                            <button className="btn pri" type="button" onClick={submit} disabled={!canSubmit || busy}>
                                {canSubmit ? `提交订单（${order.lines.length} 个零件）→` : `还有 ${noDrawing} 个零件缺图纸`}
                            </button>
                        }
                    />
                )}
            </Card>
        </Page>
    )
}
