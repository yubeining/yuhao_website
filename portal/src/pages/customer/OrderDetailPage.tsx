/**
 * 订单详情 —— 草稿里加零件、每个零件传自己的图纸，传齐后提交。
 *
 * ★ 提交条件（2026-09-14 拍板）：每个零件行都要有至少一份传完的图纸。
 * ★ 提交时锁定各行的图纸版本，之后这张订单不能再改 —— 收货地址除外：
 *   提交时必填，订单就绪（READY）之前都能改（2026-11-23 拍板，见 ShipToEditor）。
 * ★ 提交之后这里只写「已提交、图纸已锁定」这一个事实 —— 不承诺报价时间：
 *   平台什么时候报价没有约定，写「预计 X 内报价」就是一句没有依据的承诺（CLAUDE.md §10 C5）。
 *   报价发出后（QUOTED / CONFIRMED）给一个去报价页的入口。
 * ★ 发货（2026-11-24）：运营发货后显示承运商 / 运单号 / 随货文件，客户点「确认收货」订单完成（不能撤回）。
 */

import { useCallback, useEffect, useState } from 'react'
import { useAutoClear } from '../../components/useAutoClear'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Field, FieldRow, Input } from '../../components/form'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Empty, Hello, Page, pill, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useI18n } from '../../i18n/I18nProvider'
import { DatePicker } from '../../components/DatePicker'
import { ConfirmDialog, useConfirm } from '../../components/ConfirmDialog'
import { getMyOrganization } from '../../services/customer/organization'
import { fmtDate, fmtDateTime, fmtMoney, X } from '../../lib/format'
import {
    ApiError, confirmReceipt, getOrder, getOrderQuote, removeLine, submitOrder, updateOrder,
    type CustomerQuoteView, type OrderView,
} from '../../services'
import { ShipToEditor } from './ShipToEditor'
import { ShipmentCard } from './ShipmentCard'
import { lineFulfillSt, orderSt } from './status'

export function OrderDetailPage() {
    const { t } = useI18n()
    const navigate = useNavigate()
    const { id = '' } = useParams()
    // 从列表点进来时带着列表地址（含页码）；直接打开的链接退回列表首页
    const backState = (useLocation().state as { back?: string } | null)?.back
    const backTo = backState?.startsWith('/customer/orders') ? backState : '/customer/orders'
    const [order, setOrder] = useState<OrderView | null>(null)
    const [missing, setMissing] = useState(false)
    const [loadErr, setLoadErr] = useState<string | null>(null)
    const [title, setTitle] = useState('')
    const [wantedDate, setWantedDate] = useState('')
    const [saved, setSaved] = useState(false)
    const [orgName, setOrgName] = useState<string | null>(null)
    const [quote, setQuote] = useState<CustomerQuoteView | null>(null)
    const [confirmSubmit, setConfirmSubmit] = useState(false)
    const [confirmReceive, setConfirmReceive] = useState(false)
    const [askConfirm, confirmDialog] = useConfirm()
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
            setMissing(false)
            setLoadErr(null)
        } catch (e) {
            // 400 = id 根本不是合法格式（比如旧原型留下的 SO-0001 书签），和 404 一样按「不存在」处理
            if (e instanceof ApiError && (e.code === 404 || e.code === 400)) setMissing(true)
            else setLoadErr(errorText(t, e))
        }
    }, [id, t])

    useEffect(() => { void load() }, [load])

    // 公司名是提交订单的前置条件：注册时已收，老账号可能还是空的 —— 先查一次再决定按钮是否可用
    useEffect(() => {
        if (order?.status !== 'DRAFT') return
        getMyOrganization().then((o) => setOrgName(o.name ?? '')).catch(() => undefined)
    }, [order?.status, order?.id])

    // 已报价/已确认：状态条要显示金额和交期，从报价接口取
    useEffect(() => {
        if (order?.status !== 'QUOTED' && order?.status !== 'CONFIRMED') return
        getOrderQuote(order.id).then(setQuote).catch(() => setQuote(null))
    }, [order?.status, order?.id])

    useAutoClear(saved, () => setSaved(false))

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
    const inProduction = order.status === 'CONFIRMED' || order.status === 'READY' || order.status === 'SHIPPED'
        || order.status === 'COMPLETED'
    const noDrawing = order.lines.filter((l) => l.revision.files.length === 0).length
    const totalQty = order.lines.reduce((a, l) => a + l.quantity, 0)
    // 只有「查到了、确实是空的」才算缺公司名。没查到（请求失败 / 还在路上）不拦按钮 ——
    // 以前这种情况按钮直接变灰又不说原因；真缺的话提交时后端也会拒绝并给出原因。
    const missingCompany = orgName !== null && !orgName.trim()
    // 期望交期必填（2026-11-15）：报价的承诺交期从它起，提交前必须有
    const missingWantedDate = !order.wantedDate
    // 收货地址提交时必填（2026-11-23）
    const missingShipTo = !order.shipTo
    const canSubmit = draft && order.lines.length > 0 && noDrawing === 0 && !missingCompany && !missingWantedDate
        && !missingShipTo

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

    const receive = async () => {
        setBusy(true)
        try {
            apply(await confirmReceipt(order.id))
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
            await load()
        } finally {
            setBusy(false)
        }
    }

    /** 删行前先问：以前点一下就删了，这一行传过的图纸也跟着没了。 */
    const remove = async (lineId: string, code: string) => {
        if (!(await askConfirm(t.customer.orderDetail.confirmRemoveLine(code), { danger: true }))) return
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
                back={<Link className="btn sm qui" to={backTo} style={{ margin: '0 0 6px -9px' }}>{t.customer.orderDetail.backToOrders}</Link>}
                title={order.title || t.common.untitledOrder}
                right={
                    <>
                        {pill(orderSt(t)[order.status])}
                        {/* ★ 按钮名固定「提交订单」：原因属于说明，不该被写成按钮文案 */}
                        {draft && (
                            <>
                                {!canSubmit && order.lines.length === 0 && (
                                    <span className="t2" style={{ color: 'var(--muted)' }}>
                                        {t.customer.orderDetail.needParts}
                                    </span>
                                )}
                                {!canSubmit && missingWantedDate && order.lines.length > 0 && (
                                    <span className="t2" style={{ color: 'var(--muted)' }}>
                                        {t.customer.orderDetail.needWantedDate}
                                    </span>
                                )}
                                {missingShipTo && !missingWantedDate && order.lines.length > 0 && (
                                    <span className="t2" style={{ color: 'var(--muted)' }}>
                                        {t.shipTo.need}
                                    </span>
                                )}
                                {missingCompany && !missingWantedDate && !missingShipTo && order.lines.length > 0 && (
                                    <span className="t2" style={{ color: 'var(--muted)' }}>
                                        {t.customer.orderDetail.needCompany}
                                        {' '}<Link className="linkbtn" to="/customer/settings">{t.customer.orderDetail.fillCompany}</Link>
                                    </span>
                                )}
                                <button className="btn pri" type="button" onClick={() => setConfirmSubmit(true)} disabled={!canSubmit || busy}>
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
            {confirmDialog}
            {confirmSubmit && (
                <ConfirmDialog
                    title={t.customer.orderDetail.submitConfirmTitle}
                    message={t.customer.orderDetail.submitConfirmBody}
                    confirmLabel={t.customer.orderDetail.submitConfirmCta}
                    busy={busy}
                    onCancel={() => setConfirmSubmit(false)}
                    onConfirm={() => { void submit().then(() => setConfirmSubmit(false)) }}
                />
            )}
            {confirmReceive && (
                <ConfirmDialog
                    title={t.shipping.confirmReceiptTitle}
                    message={t.shipping.confirmReceiptBody}
                    confirmLabel={t.shipping.confirmReceipt}
                    busy={busy}
                    onCancel={() => setConfirmReceive(false)}
                    onConfirm={() => { void receive().then(() => setConfirmReceive(false)) }}
                />
            )}

            {/* 状态条：一句话说明现在在等什么，右侧是这一步唯一需要做的事 */}
            {order.status === 'SUBMITTED' && (
                <Banner tone="in" style={{ marginBottom: 14 }}>
                    <span className="bnr-row">
                        <span>{t.customer.orderDetail.statusSubmitted}</span>
                        <Link to="/customer/quotes">{t.customer.orderDetail.statusViewQuotes}</Link>
                    </span>
                </Banner>
            )}
            {order.status === 'QUOTED' && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>
                    <span className="bnr-row">
                        {/* 没有总价（取不到汇率）时不编一个 0，退回不带金额的通用文案 */}
                        <span>{quote && quote.total != null
                            ? t.customer.orderDetail.statusQuoted(fmtMoney(quote.total, quote.currency), quote.commitDate)
                            : t.customer.orderDetail.quotedBanner}</span>
                        <Link className="btn sm" to={`/customer/quotes/${order.id}`}>
                            {t.customer.orderDetail.statusConfirmQuote}
                        </Link>
                    </span>
                </Banner>
            )}
            {order.status === 'CONFIRMED' && (
                <Banner tone="ok" style={{ marginBottom: 14 }}>
                    <span className="bnr-row">
                        <span>{t.customer.orderDetail.statusConfirmed}</span>
                        <Link to={`/customer/quotes/${order.id}`}>{t.customer.orderDetail.statusQuoteDetail}</Link>
                    </span>
                </Banner>
            )}
            {order.status === 'READY' && (
                <Banner tone="ok" style={{ marginBottom: 14 }}>{t.customer.orderDetail.statusReady}</Banner>
            )}
            {order.status === 'SHIPPED' && (
                <Banner tone="in" style={{ marginBottom: 14 }}>
                    <span className="bnr-row">
                        <span>{t.shipping.customerShipped}</span>
                        <button className="btn pri sm" type="button" disabled={busy}
                            onClick={() => setConfirmReceive(true)}>{t.shipping.confirmReceipt}</button>
                    </span>
                </Banner>
            )}
            {order.status === 'COMPLETED' && order.shipment?.receivedAt && (
                <Banner tone="ok" style={{ marginBottom: 14 }}>
                    {t.shipping.customerCompleted(fmtDateTime(new Date(order.shipment.receivedAt)))}
                </Banner>
            )}
            {order.status === 'CANCELLED' && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>{t.customer.orderDetail.cancelledBanner}</Banner>
            )}

            {/* ★ 零件表放最上面（2026-11-24 改版）：零件是订单的主体，订单信息和收货地址是附属，
                并排放在它下面 */}
            <ShipmentCard order={order} />

            <Card style={{ marginBottom: 16 }}>
                <CardHead title={t.customer.orderDetail.partsTitle(order.lines.length)} />
                {order.lines.length ? (
                    <CardBody flush>
                        <TableWrap className="partsTable">
                            <thead>
                                <tr>
                                    <th className="n">#</th><th>{t.customer.orderDetail.colCode}</th><th>{t.common.table.name}</th><th>{t.customer.orderDetail.colRevision}</th><th>{t.customer.orderDetail.colMaterial}</th>
                                    <th className="n">{t.customer.orderDetail.colQty}</th><th>{t.customer.orderDetail.colDrawing}</th>
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
                                            {/* 只显示客户自己标的版本；系统内部的第 N 版对客户没有意义（2026-11-18 去掉） */}
                                            {l.revision.customerRev || X}
                                        </td>
                                        <td>{l.material || X}</td>
                                        <td className="n">{l.quantity}</td>
                                        <td><span className={`dstat${l.revision.files.length ? ' ok' : ' miss'}`}>
                                            <i />{l.revision.files.length ? t.customer.orderDetail.drawingUploaded : t.customer.orderDetail.drawingMissing}
                                        </span></td>
                                        {inProduction && <td>{pill(lineFulfillSt(t)[l.fulfillmentStatus])}</td>}
                                        <td style={{ textAlign: 'right' }}>
                                            {draft
                                                ? <button className="linkbtn" type="button"
                                                    onClick={(e) => { e.stopPropagation(); void remove(l.id, l.code) }}>{t.customer.orderDetail.remove}</button>
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
                            action={draft ? <>
                                <Link className="btn pri" to={`/customer/orders/${order.id}/parts/new`}>{t.customer.orderDetail.addFirstPart}</Link>
                                {' '}<Link className="btn" to={`/customer/orders/${order.id}/parts/batch`}>{t.customer.orderDetail.batchAdd}</Link>
                            </> : undefined} />
                    </CardBody>
                )}
                {draft && order.lines.length > 0 && (
                    <CardFoot
                        left={<>
                            <Link className="btn" to={`/customer/orders/${order.id}/parts/new`}>{t.customer.orderDetail.addPart}</Link>
                            {' '}<Link className="btn" to={`/customer/orders/${order.id}/parts/batch`}>{t.customer.orderDetail.batchAdd}</Link>
                        </>}
                    />
                )}
            </Card>

            <div className="cols">
                <Card style={{ marginBottom: 16 }}>
                    <CardHead title={t.customer.orderDetail.infoTitle}
                        right={saved ? <span className="t2" style={{ color: 'var(--muted)' }}>{t.common.saved}</span> : undefined} />
                    <CardBody>
                        {/* ★ 同一张卡只用一套规格：标签 12.5px 常规、值 14px。
                            可编辑与只读靠「输入框 vs 纯文本」区分，不靠字号 —— 之前混了 Fld(10.5 大写/13 等宽)。 */}
                        <FieldRow>
                            <Field label={t.customer.orderDetail.fldName}>
                                {draft
                                    ? <Input value={title} onChange={setTitle} onBlur={() => void saveDraftInfo()} />
                                    : <div className="ro">{order.title || X}</div>}
                            </Field>
                            {/* 「必填」只对还能改的草稿有意义；提交后是只读文本，再挂必填是噪音 */}
                            <Field label={t.customer.orderDetail.fldLead} required={!!draft}>
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

                <ShipToEditor order={order} onSaved={(o) => { apply(o); setErr(null) }} />
            </div>
        </Page>
    )
}
