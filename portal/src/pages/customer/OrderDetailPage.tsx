/**
 * 订单详情 —— 草稿里加零件、每个零件传自己的图纸，传齐后提交。
 *
 * ★ 提交条件（2026-09-14 拍板）：每个零件行都要有至少一份传完的图纸。
 * ★ 提交时锁定各行的图纸版本，之后这张订单不能再改。
 * ★ 提交之后这里只写「已提交、图纸已锁定」这一个事实 —— 不承诺报价时间：
 *   平台什么时候报价没有约定，写「预计 X 内报价」就是一句没有依据的承诺（CLAUDE.md §10 C5）。
 *   报价发出后（QUOTED / CONFIRMED）给一个去报价页的入口。
 */

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Field, FieldRow, Input } from '../../components/form'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Empty, Hello, Page, Pill, pill, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { DatePicker } from '../../components/DatePicker'
import { fmtDate, fmtDateTime, X } from '../../mock/format'
import {
    ApiError, getOrder, removeLine, submitOrder, updateOrder, type OrderView,
} from '../../services'
import { lineFulfillSt, orderSt } from './status'

export function OrderDetailPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const { id = '' } = useParams()
    const [order, setOrder] = useState<OrderView | null>(null)
    const [missing, setMissing] = useState(false)
    const [loadErr, setLoadErr] = useState<string | null>(null)
    const [title, setTitle] = useState('')
    const [wantedDate, setWantedDate] = useState('')
    const [saved, setSaved] = useState(false)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const apply = (o: OrderView) => {
        setOrder(o)
        setTitle(o.title ?? '')
        setWantedDate(o.wantedDate ?? '')
    }

    const load = useCallback(async () => {
        try {
            apply(await getOrder(id))
            setLoadErr(null)
        } catch (e) {
            // 400 = id 根本不是合法格式（比如旧原型留下的 SO-0001 书签），和 404 一样按「不存在」处理
            if (e instanceof ApiError && (e.code === 404 || e.code === 400)) setMissing(true)
            else setLoadErr(errorText(t, e))
        }
    }, [id, t])

    useEffect(() => { void load() }, [load])

    // 「已保存」2 秒后自己消失
    useEffect(() => {
        if (!saved) return
        const timer = window.setTimeout(() => setSaved(false), 2000)
        return () => window.clearTimeout(timer)
    }, [saved])

    if (missing) {
        return (
            <Page>
                <Card><CardBody>
                    <Empty text={t.customer.orderDetail.notFound} action={<Link className="btn" to="/customer/orders">{t.customer.orderDetail.backToOrders}</Link>} />
                </CardBody></Card>
            </Page>
        )
    }
    // ★ 加载失败要说出来：以前这里只判断「还没拿到订单」，500 / 断网时永远停在「加载中…」
    if (!order) {
        return (
            <Page><Card><CardBody>
                {loadErr
                    ? <Empty text={loadErr} action={<button className="btn" type="button" onClick={() => void load()}>{t.common.retry}</button>} />
                    : <Empty text={t.common.loading} />}
            </CardBody></Card></Page>
        )
    }

    const draft = order.status === 'DRAFT'
    // 确认报价之后才谈得上进度；在那之前这一列是空的，不如不显示（CLAUDE.md §10 C5）
    const inProduction = order.status === 'CONFIRMED' || order.status === 'READY'
    const noDrawing = order.lines.filter((l) => l.revision.files.length === 0).length
    const totalQty = order.lines.reduce((a, l) => a + l.quantity, 0)
    const canSubmit = draft && order.lines.length > 0 && noDrawing === 0

    const saveDraftInfo = async (nextDate?: string) => {
        const date = (nextDate ?? wantedDate).trim() || null
        // 后端不输出 null 字段，拿到的是 undefined —— 统一成 null 再比，否则每次失焦都会多发一次保存
        if ((title.trim() || null) === (order.title ?? null) && date === (order.wantedDate ?? null)) return
        try {
            apply(await updateOrder(order.id, { title: title.trim() || null, wantedDate: date }))
            setErr(null)
            // ★ 失焦即保存，就必须告诉用户存了 —— 否则改完切走，不知道生效没有
            setSaved(true)
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
                back={<Link className="btn sm qui" to="/customer/orders" style={{ margin: '0 0 6px -9px' }}>{t.customer.orderDetail.backToOrders}</Link>}
                title={order.title || t.common.untitledOrder}
                right={
                    <>
                        {pill(orderSt(t)[order.status])}
                        {/* ★ 按钮名固定「提交订单」：原因属于说明，不该被写成按钮文案 */}
                        {draft && (
                            <>
                                {!canSubmit && (
                                    <span className="t2" style={{ color: 'var(--muted)' }}>
                                        {order.lines.length === 0
                                            ? t.customer.orderDetail.needParts
                                            : t.customer.orderDetail.needDrawings(noDrawing)}
                                    </span>
                                )}
                                <button className="btn pri" type="button" onClick={submit} disabled={!canSubmit || busy}>
                                    {t.customer.orderDetail.submit}
                                </button>
                            </>
                        )}
                    </>
                }
            />

            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {draft && noDrawing > 0 && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>{t.customer.orderDetail.missingDrawingBanner(noDrawing)}</Banner>
            )}
            {order.status === 'SUBMITTED' && (
                <Banner tone="in" style={{ marginBottom: 14 }}>{t.customer.orderDetail.submittedBanner}</Banner>
            )}
            {order.status === 'QUOTED' && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>
                    {t.customer.orderDetail.quotedBanner}<Link to={`/customer/quotes/${order.id}`} style={{ marginLeft: 6 }}>{t.customer.orderDetail.quoteLink}</Link>
                </Banner>
            )}
            {order.status === 'CONFIRMED' && (
                <Banner tone="ok" style={{ marginBottom: 14 }}>
                    {t.customer.orderDetail.confirmedBanner}<Link to={`/customer/quotes/${order.id}`} style={{ marginLeft: 6 }}>{t.customer.orderDetail.quoteLink}</Link>
                </Banner>
            )}
            {order.status === 'CANCELLED' && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>{t.customer.orderDetail.cancelledBanner}</Banner>
            )}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title={t.customer.orderDetail.infoTitle}
                    right={saved ? <span className="t2" style={{ color: 'var(--muted)' }}>{t.common.saved}</span> : undefined} />
                <CardBody>
                    {/* ★ 同一张卡只用一套规格：标签 12.5px 常规、值 14px。
                        可编辑与只读靠「输入框 vs 纯文本」区分，不靠字号 —— 之前混了 Fld(10.5 大写/13 等宽)。 */}
                    <FieldRow>
                        <Field label={t.customer.orderDetail.fldName}>
                            {draft
                                ? <Input value={title} placeholder={t.customer.orderDetail.titlePlaceholder} onChange={setTitle} onBlur={() => void saveDraftInfo()} />
                                : <div className="ro">{order.title || X}</div>}
                        </Field>
                        <Field label={t.customer.orderDetail.fldLead}>
                            {draft
                                ? <DatePicker value={wantedDate} onChange={(v) => { setWantedDate(v); void saveDraftInfo(v) }} />
                                : <div className="ro">{order.wantedDate || X}</div>}
                        </Field>
                    </FieldRow>

                    <div className="f4row" style={{ marginTop: 14 }}>
                        <Field label={t.customer.orderDetail.fldParts}><div className="ro">{order.lines.length}</div></Field>
                        <Field label={t.customer.orderDetail.fldTotalQty}><div className="ro">{totalQty}</div></Field>
                        {/* ★ 后端给的是 UTC 的 ISO 字符串，必须转成本地时区再显示（CLAUDE.md §4） */}
                        <Field label={t.customer.orderDetail.fldCreated}><div className="ro">{fmtDate(new Date(order.createdAt))}</div></Field>
                        <Field label={t.customer.orderDetail.fldSubmitted}>
                            <div className="ro">{order.submittedAt ? fmtDateTime(new Date(order.submittedAt)) : X}</div>
                        </Field>
                    </div>
                </CardBody>
            </Card>

            <Card>
                <CardHead
                    title={t.customer.orderDetail.partsTitle(order.lines.length)}
                    right={draft && noDrawing > 0 ? <Pill tone="wa">{t.customer.orderDetail.missingDrawingPill(noDrawing)}</Pill> : undefined}
                />
                {order.lines.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th className="n">#</th><th>{t.customer.orderDetail.colCode}</th><th>{t.common.table.name}</th><th>{t.customer.orderDetail.colRevision}</th><th>{t.customer.orderDetail.colMaterial}</th>
                                    <th className="n">{t.customer.orderDetail.colQty}</th><th className="n">{t.customer.orderDetail.colDrawing}</th><th>{t.common.table.status}</th>
                                    {inProduction && <th>{t.customer.orderDetail.colProgress}</th>}<th />
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
                                            {l.revision.customerRev && <div className="t2">{t.customer.orderDetail.customerRev(l.revision.customerRev)}</div>}
                                        </td>
                                        <td>{l.material || X}</td>
                                        <td className="n">{l.quantity}</td>
                                        <td className="n">{l.revision.files.length || X}</td>
                                        <td>{l.revision.files.length ? <Pill tone="ok">{t.customer.orderDetail.drawingUploaded}</Pill> : <Pill tone="wa">{t.customer.orderDetail.drawingMissing}</Pill>}</td>
                                        {inProduction && <td>{pill(lineFulfillSt(t)[l.fulfillmentStatus])}</td>}
                                        <td style={{ textAlign: 'right' }}>
                                            {draft
                                                ? <button className="btn qui sm" type="button"
                                                    onClick={(e) => { e.stopPropagation(); void remove(l.id) }}>{t.customer.orderDetail.remove}</button>
                                                : <span style={{ color: 'var(--faint)' }}>›</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody>
                        <Empty text={t.customer.orderDetail.emptyParts} sub={t.customer.orderDetail.emptyPartsSub}
                            action={draft ? <Link className="btn pri" to={`/customer/orders/${order.id}/parts/new`}>{t.customer.orderDetail.addFirstPart}</Link> : undefined} />
                    </CardBody>
                )}
                {draft && order.lines.length > 0 && (
                    <CardFoot
                        left={<Link className="btn" to={`/customer/orders/${order.id}/parts/new`}>{t.customer.orderDetail.addPart}</Link>}
                    />
                )}
            </Card>
        </Page>
    )
}
