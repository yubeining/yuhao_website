/**
 * 订单详情 / 新建订单（2026-11-27 整页编辑）。
 *
 * ★ 一个页面一个「编辑」一个「保存」：零件、订单信息、收货地址一起编辑，底部固定栏「取消 / 保存」一次存。
 *   「取消」撤销这一轮全部改动；删行、删文件、加文件都等保存才生效。
 *   这是 CLAUDE.md §10 C7 的例外（草稿订单整页编辑，不走弹框），理由写在 C7 里。
 * ★ 新建订单直接进编辑状态，第一次保存才建单；还没保存就取消，回列表，不留空订单。
 * ★ 草稿随便存，不提示必填（2026-11-27）。点「提交订单」时才检查：缺的项目在弹框里列出来，
 *   「去完善」进编辑状态、把缺的地方标红、滚到第一处。
 * ★ 提交时锁定各行的图纸版本，之后零件不能再改；收货地址就绪（READY）之前都能单独改（2026-11-23）。
 * ★ 提交之后这里只写「已提交、图纸已锁定」这一个事实 —— 不承诺报价时间（CLAUDE.md §10 C5）。
 *   报价发出后（QUOTED / CONFIRMED）给一个去报价页的入口。
 * ★ 发货（2026-11-24）：运营发货后显示承运商 / 运单号 / 随货文件，客户点「确认收货」订单完成（不能撤回）。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DatePicker, localTodayISO } from '../../components/DatePicker'
import { FilePreviewModal, previewKindOf, type PreviewKind } from '../../components/FilePreviewModal'
import { Field, FieldRow, Input } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Banner, Bar, Card, CardBody, CardHead, Empty, Hello, Page, pill } from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useI18n } from '../../i18n/I18nProvider'
import { fmtDate, fmtDateTime, fmtMoney, X } from '../../lib/format'
import {
    blankOrder, fromOrder, hasProblems, isDirty, newFile, qtyInvalid, submitProblems, toSavePlan,
    type EditOrder, type SavedFile, type SubmitProblems,
} from '../../lib/orderDraft'
import { getMyOrganization } from '../../services/customer/organization'
import {
    ApiError, confirmReceipt, createOrder, filePreviewUrl, getOrder, getOrderQuote, lineFileViewUrl,
    listShippingAddresses, saveOrder, submitOrder, updateShipTo, uploadDrawing,
    type CustomerQuoteView, type OrderStatus, type OrderView,
} from '../../services'
import { OrderPartsTable } from './OrderPartsTable'
import { ShipmentCard } from './ShipmentCard'
import { ShipToEditor, toShipTo } from './ShipToEditor'
import { orderSt } from './status'

/** 收货地址能单独改的状态（就绪之前，2026-11-23）。草稿的地址走整页编辑。 */
const SHIP_TO_LIVE: OrderStatus[] = ['SUBMITTED', 'QUOTED', 'CONFIRMED']

const cloneEdit = (o: EditOrder): EditOrder => ({ ...o, rows: o.rows.map((r) => ({ ...r, files: [...r.files] })) })

export function OrderDetailPage() {
    const { t } = useI18n()
    const e = t.customer.orderEdit
    const d = t.customer.orderDetail
    const navigate = useNavigate()
    const { id } = useParams()
    const isNew = !id
    // 从列表点进来时带着列表地址（含页码）；直接打开的链接退回列表首页
    const backState = (useLocation().state as { back?: string } | null)?.back
    const backTo = backState?.startsWith('/customer/orders') ? backState : '/customer/orders'

    const [order, setOrder] = useState<OrderView | null>(null)
    const [missing, setMissing] = useState(false)
    const [loadErr, setLoadErr] = useState<string | null>(null)
    /** 编辑前的样子（取消时回到它，和它比有没有改动） */
    const [base, setBase] = useState<EditOrder | null>(null)
    /** 编辑中的副本；null = 只读 */
    const [edit, setEdit] = useState<EditOrder | null>(null)
    const [showMissing, setShowMissing] = useState(false)
    const [showQtyErr, setShowQtyErr] = useState(false)
    const [failedFiles, setFailedFiles] = useState<Set<File>>(new Set())
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
    const [quote, setQuote] = useState<CustomerQuoteView | null>(null)
    const [check, setCheck] = useState<SubmitProblems | null>(null)
    const [confirmSubmit, setConfirmSubmit] = useState(false)
    const [confirmReceive, setConfirmReceive] = useState(false)
    const [confirmCancel, setConfirmCancel] = useState(false)
    const [preview, setPreview] = useState<{ name: string; url: string; kind: PreviewKind; lineId: string; fileId: string } | null>(null)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    /**
     * 公司名（提交检查要用）：草稿一打开就取好，点「提交订单」时不用再等一次网络（2026-11-27 线上走查：
     * 每次点击现取，慢的时候将近 1 秒没有任何反应）。undefined = 还没取到；null = 取失败（不拦，后端会兜）。
     */
    const [orgName, setOrgName] = useState<string | null | undefined>(undefined)
    /** 保存时出错（数量不合法 / 图纸没传上）：每次 +1，让下面的 effect 把第一个标红的地方滑进视野 */
    const [badTick, setBadTick] = useState(0)
    /** 已经载入的订单 id：新建保存后跳到 /orders/:id 时不要再载一遍、冲掉没传完的图纸 */
    const loadedId = useRef<string | null>(null)
    /** 自己发起的跳转（保存后、确认放弃后）不要再被「有改动未保存」拦住：拦截函数拿到的还是旧的 dirty */
    const allowNav = useRef(false)

    const showOrder = (o: OrderView) => {
        setOrder(o)
        setBase(fromOrder(o))
    }

    const load = useCallback(async () => {
        try {
            if (!id) {
                // 新建：带上地址簿里的默认地址（2026-11-27）；取不到地址簿不影响建单
                const book = await listShippingAddresses().catch(() => [])
                const def = book.find((a) => a.isDefault)
                const start = blankOrder(def ? toShipTo(def) : null)
                setBase(start)
                setEdit(cloneEdit(start))
                return
            }
            const o = await getOrder(id)
            loadedId.current = o.id
            showOrder(o)
            setMissing(false)
            setLoadErr(null)
        } catch (ex) {
            // 400 = id 根本不是合法格式（比如旧原型留下的 SO-0001 书签），和 404 一样按「不存在」处理
            if (ex instanceof ApiError && (ex.code === 404 || ex.code === 400)) setMissing(true)
            else setLoadErr(errorText(t, ex))
        }
    }, [id, t])

    useEffect(() => {
        // 地址变了说明自己发起的跳转已经完成，之后的离开照常拦
        allowNav.current = false
        if (id && id === loadedId.current) return
        void load()
    }, [id, load])

    // 已报价/已确认：状态条要显示金额和交期，从报价接口取
    useEffect(() => {
        if (order?.status !== 'QUOTED' && order?.status !== 'CONFIRMED') return
        getOrderQuote(order.id).then(setQuote).catch(() => setQuote(null))
    }, [order?.status, order?.id])

    const dirty = !!(edit && base && isDirty(base, edit))
    const status0 = order?.status

    // 编辑中离开：站内跳转弹自己的确认框；关页 / 刷新只能用浏览器自带的提示
    const blocker = useBlocker(({ currentLocation, nextLocation }) =>
        dirty && !allowNav.current && currentLocation.pathname !== nextLocation.pathname)
    useEffect(() => {
        if (!dirty) return
        const warn = (ev: BeforeUnloadEvent) => { ev.preventDefault() }
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
    }, [dirty])

    // 「去完善」之后滚到第一个标红的地方
    useEffect(() => {
        if (!showMissing || !edit) return
        const first = document.querySelector<HTMLElement>('.page .bad')
        first?.scrollIntoView({ block: 'center' })
        first?.focus()
    }, [showMissing, edit === null])

    // 保存时数量不合法：窄屏上标红的数量格常在表格右边屏幕外，把它横向滑进来（竖向只在看不见时才动，顶部提示尽量留在眼前）。
    // 传失败的文件由表格自己滑过去 —— 它得先把那一行展开
    useEffect(() => {
        if (!badTick) return
        document.querySelector<HTMLElement>('.page .partsTable .inp.bad')?.scrollIntoView({ block: 'nearest', inline: 'center' })
    }, [badTick])

    // 数量都改对了：标红和「数量要填正整数」的提示一起消失，不用等退出编辑
    useEffect(() => {
        if (!showQtyErr || !edit || edit.rows.some((r) => qtyInvalid(r.qty))) return
        setShowQtyErr(false)
        setErr((cur) => (cur === e.qtyInvalid ? null : cur))
    }, [edit, showQtyErr, e.qtyInvalid])

    useEffect(() => {
        if (status0 !== 'DRAFT' && !isNew) return
        let alive = true
        getMyOrganization().then((o) => { if (alive) setOrgName(o.name ?? '') }).catch(() => { if (alive) setOrgName(null) })
        return () => { alive = false }
    }, [status0, isNew])

    if (missing) {
        return (
            <Page>
                <Card><CardBody>
                    <Empty text={d.notFound} action={<Link className="btn" to="/customer/orders">{d.backToOrders}</Link>} />
                </CardBody></Card>
            </Page>
        )
    }
    // ★ 加载失败要说出来：以前这里只判断「还没拿到订单」，500 / 断网时永远停在「加载中…」
    if (!base || (!isNew && !order)) {
        return (
            <Page><Card><CardBody>
                {loadErr
                    ? <Empty text={loadErr} action={<button className="btn" type="button" onClick={() => void load()}>{t.common.retry}</button>} />
                    : <Empty text={t.common.loading} />}
            </CardBody></Card></Page>
        )
    }

    const view = edit ?? base
    const status = order?.status
    const draft = !order || status === 'DRAFT'
    // 确认报价之后才谈得上进度；在那之前这一列是空的，不如不显示（CLAUDE.md §10 C5）
    const inProduction = status === 'CONFIRMED' || status === 'READY' || status === 'SHIPPED' || status === 'COMPLETED'
    const totalQty = view.rows.reduce((a, r) => a + (Number(r.qty) || 0), 0)

    const startEdit = () => {
        setEdit(cloneEdit(base))
        setErr(null)
    }

    const leaveEdit = () => {
        setEdit(null)
        setShowMissing(false)
        setShowQtyErr(false)
        setFailedFiles(new Set())
        setErr(null)
        if (isNew) {
            allowNav.current = true
            navigate(backTo)
        }
    }

    const cancel = () => {
        if (dirty) setConfirmCancel(true)
        else leaveEdit()
    }

    const save = async () => {
        if (!edit) return
        if (edit.rows.some((r) => qtyInvalid(r.qty))) {
            setShowQtyErr(true)
            setErr(e.qtyInvalid)
            setBadTick((n) => n + 1)
            return
        }
        setBusy(true)
        setErr(null)
        try {
            const plan = toSavePlan(base, edit)
            const saved = isNew || !order ? await createOrder(plan.input) : await saveOrder(order.id, plan.input)
            const byId = new Map(saved.order.lines.map((l) => [l.id, l]))
            const jobs = plan.uploads.flatMap((u) => {
                const lineId = u.lineId ?? saved.createdLineIds[u.newIndex!]
                return u.files.map((file) => ({ lineId, file }))
            })
            const failed: { lineId: string; file: File }[] = []
            setProgress(jobs.length ? { done: 0, total: jobs.length } : null)
            for (const [i, job] of jobs.entries()) {
                const line = byId.get(job.lineId)
                try {
                    if (!line) throw new Error('line not found')
                    await uploadDrawing(line.partId, line.revision.id, job.file)
                } catch {
                    failed.push(job)
                }
                setProgress({ done: i + 1, total: jobs.length })
            }
            const fresh = jobs.length ? await getOrder(saved.order.id) : saved.order
            loadedId.current = fresh.id
            showOrder(fresh)
            if (failed.length) {
                // 传失败的留在编辑状态里（标红），可以再点保存重传或者删掉（2026-11-27 拍板）
                const next = fromOrder(fresh)
                next.rows = next.rows.map((r) => ({
                    ...r,
                    files: [...r.files, ...failed.filter((f) => f.lineId === r.lineId).map((f) => newFile(f.file))],
                }))
                setEdit(next)
                setFailedFiles(new Set(failed.map((f) => f.file)))
                setErr(e.uploadFailed(failed.length))
                setBadTick((n) => n + 1)
            } else {
                setEdit(null)
                setShowMissing(false)
                setShowQtyErr(false)
                setFailedFiles(new Set())
            }
            if (isNew) {
                allowNav.current = true
                navigate(`/customer/orders/${fresh.id}`, { replace: true })
            }
        } catch (ex) {
            setErr(errorText(t, ex))
        } finally {
            setBusy(false)
            setProgress(null)
        }
    }

    const startSubmit = async () => {
        // 公司名是提交订单的前置条件：只有「查到了、确实是空的」才算缺；没查到不拦，真缺的话后端也会拒绝。
        // 打开页面时已经取好；还没取回来（刚打开就点）才现取，取的时候按钮转「…」，不让人以为没点上
        let name = orgName
        if (name === undefined) {
            setBusy(true)
            name = await getMyOrganization().then((o) => o.name ?? '').catch(() => null)
            setOrgName(name)
            setBusy(false)
        }
        const p = submitProblems(base, name !== null && !name.trim())
        if (hasProblems(p)) setCheck(p)
        else setConfirmSubmit(true)
    }

    const fix = () => {
        if (!check) return
        const onlyCompany = !check.noParts && !check.incompleteRows && !check.rowsWithoutDrawing && !check.wantedDate && !check.shipTo
        setCheck(null)
        if (onlyCompany) {
            navigate('/customer/settings')
            return
        }
        setEdit(cloneEdit(base))
        setShowMissing(true)
    }

    const submit = async () => {
        if (!order) return
        setBusy(true)
        try {
            showOrder(await submitOrder(order.id))
            setErr(null)
        } catch (ex) {
            setErr(errorText(t, ex))
            await load()
        } finally {
            setBusy(false)
        }
    }

    const receive = async () => {
        if (!order) return
        setBusy(true)
        try {
            showOrder(await confirmReceipt(order.id))
            setErr(null)
        } catch (ex) {
            setErr(errorText(t, ex))
            await load()
        } finally {
            setBusy(false)
        }
    }

    const openPreview = async (lineId: string, file: SavedFile) => {
        if (!order) return
        try {
            const kind = previewKindOf(file.name)
            if (kind) {
                const { url } = await filePreviewUrl(file.id)
                setPreview({ name: file.name, url, kind, lineId, fileId: file.id })
            } else {
                // CAD 格式浏览器看不了：直接下载（链接带 attachment，不会离开本页）
                window.location.assign((await lineFileViewUrl(order.id, lineId, file.id)).url)
            }
        } catch (ex) {
            setErr(errorText(t, ex))
        }
    }

    const shipToLive = !!order && SHIP_TO_LIVE.includes(order.status)

    return (
        <Page>
            <Hello
                back={<Link className="btn sm qui" to={backTo} style={{ margin: '0 0 6px -9px' }}>{d.backToOrders}</Link>}
                title={view.title.trim() || (isNew ? e.newTitle : t.common.untitledOrder)}
                right={<>
                    {order && pill(orderSt(t)[order.status])}
                    {order && draft && !edit && <>
                        <button className="btn" type="button" disabled={busy} onClick={startEdit}>{e.edit}</button>
                        {/* ★ 按钮名固定「提交订单」：缺什么点了再说，不写在按钮旁边（2026-11-27：草稿不提示） */}
                        <button className="btn pri" type="button" disabled={busy} onClick={() => void startSubmit()}>{busy ? '…' : d.submit}</button>
                    </>}
                </>}
            />

            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}

            {/* 状态条：一句话说明现在在等什么，右侧是这一步唯一需要做的事 */}
            {status === 'SUBMITTED' && (
                <Banner tone="in" style={{ marginBottom: 14 }}>
                    <span className="bnr-row">
                        <span>{d.statusSubmitted}</span>
                        <Link to="/customer/quotes">{d.statusViewQuotes}</Link>
                    </span>
                </Banner>
            )}
            {status === 'QUOTED' && order && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>
                    <span className="bnr-row">
                        {/* 没有总价（取不到汇率）时不编一个 0，退回不带金额的通用文案 */}
                        <span>{quote && quote.total != null
                            ? d.statusQuoted(fmtMoney(quote.total, quote.currency), quote.commitDate)
                            : d.quotedBanner}</span>
                        <Link className="btn sm" to={`/customer/quotes/${order.id}`}>{d.statusConfirmQuote}</Link>
                    </span>
                </Banner>
            )}
            {status === 'CONFIRMED' && order && (
                <Banner tone="ok" style={{ marginBottom: 14 }}>
                    <span className="bnr-row">
                        <span>{d.statusConfirmed}</span>
                        <Link to={`/customer/quotes/${order.id}`}>{d.statusQuoteDetail}</Link>
                    </span>
                </Banner>
            )}
            {status === 'SHIPPED' && (
                <Banner tone="in" style={{ marginBottom: 14 }}>
                    <span className="bnr-row">
                        <span>{t.shipping.customerShipped}</span>
                        <button className="btn pri sm" type="button" disabled={busy}
                            onClick={() => setConfirmReceive(true)}>{t.shipping.confirmReceipt}</button>
                    </span>
                </Banner>
            )}
            {status === 'COMPLETED' && order?.shipment?.receivedAt && (
                <Banner tone="ok" style={{ marginBottom: 14 }}>
                    {t.shipping.customerCompleted(fmtDateTime(new Date(order.shipment.receivedAt)))}
                </Banner>
            )}
            {status === 'CANCELLED' && <Banner tone="wa" style={{ marginBottom: 14 }}>{d.cancelledBanner}</Banner>}

            {order && <ShipmentCard order={order} />}

            {/* ★ 零件表放最上面（2026-11-24 改版）：零件是订单的主体，订单信息和收货地址是附属，并排放在它下面 */}
            <OrderPartsTable
                rows={view.rows}
                editing={!!edit}
                onRowsChange={(rows) => setEdit((cur) => (cur ? { ...cur, rows } : cur))}
                showMissing={showMissing}
                showQtyErrors={showQtyErr}
                failedFiles={failedFiles}
                lines={order?.lines ?? []}
                inProduction={inProduction}
                onPreview={(lineId, f) => void openPreview(lineId, f)}
                busy={busy}
            />
            {progress && progress.total > 0 && (
                <Card style={{ marginBottom: 16 }}><CardBody>
                    <div className="fnote" style={{ marginBottom: 6 }}>{e.uploading(progress.done, progress.total)}</div>
                    <Bar pct={(progress.done / progress.total) * 100} />
                </CardBody></Card>
            )}

            <div className="cols">
                <Card style={{ marginBottom: 16 }}>
                    <CardHead title={d.infoTitle} />
                    <CardBody>
                        {/* ★ 同一张卡只用一套规格：标签 12.5px 常规、值 14px。可编辑与只读靠「输入框 vs 纯文本」区分 */}
                        <FieldRow>
                            <Field label={d.fldName}>
                                {edit
                                    ? <Input value={edit.title} onChange={(v) => setEdit({ ...edit, title: v })} />
                                    : <div className="ro">{view.title || X}</div>}
                            </Field>
                            <Field label={d.fldLead}>
                                {edit
                                    ? <div className={showMissing && !edit.wantedDate ? 'bad' : undefined} tabIndex={-1}>
                                        <DatePicker value={edit.wantedDate} min={localTodayISO()} onChange={(v) => setEdit({ ...edit, wantedDate: v })} />
                                    </div>
                                    : <div className="ro">{view.wantedDate || X}</div>}
                            </Field>
                        </FieldRow>
                        <div className="f4row" style={{ marginTop: 14 }}>
                            <Field label={d.fldParts}><div className="ro">{view.rows.length}</div></Field>
                            <Field label={d.fldTotalQty}><div className="ro">{totalQty}</div></Field>
                            {/* ★ 后端给的是 UTC 的 ISO 字符串，必须转成本地时区再显示（CLAUDE.md §4） */}
                            <Field label={d.fldCreated}><div className="ro">{order ? fmtDate(new Date(order.createdAt)) : X}</div></Field>
                            <Field label={d.fldSubmitted}>
                                <div className="ro">{order?.submittedAt ? fmtDateTime(new Date(order.submittedAt)) : X}</div>
                            </Field>
                        </div>
                    </CardBody>
                </Card>

                <ShipToEditor
                    shipTo={view.shipTo}
                    editable={!!edit || shipToLive}
                    bad={!!edit && showMissing && !edit.shipTo}
                    note={status === 'READY' ? t.shipTo.lockedNote : undefined}
                    onChange={edit
                        ? (s) => setEdit({ ...edit, shipTo: s })
                        : async (s) => { if (order) showOrder(await updateShipTo(order.id, s)) }}
                />
            </div>

            {edit && (
                <div className="savebar">
                    <button className="btn" type="button" disabled={busy} onClick={cancel}>{e.cancel}</button>
                    <button className="btn pri" type="button" disabled={busy || (!dirty && failedFiles.size === 0)}
                        onClick={() => void save()}>{busy ? '…' : e.save}</button>
                </div>
            )}

            {check && <SubmitCheck problems={check} onCancel={() => setCheck(null)} onFix={fix} />}
            {confirmSubmit && (
                <ConfirmDialog
                    title={d.submitConfirmTitle}
                    message={d.submitConfirmBody}
                    confirmLabel={d.submitConfirmCta}
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
            {confirmCancel && (
                <ConfirmDialog
                    title={isNew ? e.discardNewTitle : e.cancelTitle}
                    message={isNew ? e.discardNewBody : e.cancelBody}
                    confirmLabel={isNew ? e.discardNewCta : e.cancelCta}
                    cancelLabel={e.keepEditing}
                    danger
                    onCancel={() => setConfirmCancel(false)}
                    onConfirm={() => { setConfirmCancel(false); leaveEdit() }}
                />
            )}
            {blocker.state === 'blocked' && (
                <ConfirmDialog
                    title={e.leaveTitle}
                    message={e.leaveBody}
                    confirmLabel={e.leaveCta}
                    danger
                    onCancel={() => blocker.reset()}
                    onConfirm={() => blocker.proceed()}
                />
            )}
            {preview && (
                <FilePreviewModal
                    name={preview.name}
                    url={preview.url}
                    kind={preview.kind}
                    onClose={() => setPreview(null)}
                    onDownload={() => {
                        if (!order) return
                        void lineFileViewUrl(order.id, preview.lineId, preview.fileId)
                            .then(({ url }) => window.location.assign(url))
                            .catch((ex) => setErr(errorText(t, ex)))
                    }}
                />
            )}
        </Page>
    )
}

/** 提交前的检查（2026-11-27）：只列缺了哪几项，不在弹框里填；「去完善」回到页面上去填。 */
function SubmitCheck({ problems: p, onCancel, onFix }: { problems: SubmitProblems; onCancel: () => void; onFix: () => void }) {
    const { t } = useI18n()
    const e = t.customer.orderEdit
    const items: [string, string, boolean?][] = []
    if (p.noParts) items.push([e.checkParts, e.checkPartsNone])
    if (p.incompleteRows) items.push([e.checkPartsInfo, e.checkIncomplete(p.incompleteRows)])
    if (p.rowsWithoutDrawing) items.push([e.checkDrawings, e.checkNoDrawing(p.rowsWithoutDrawing)])
    if (p.wantedDate) items.push([t.customer.orderDetail.fldLead, e.checkNotFilled])
    if (p.shipTo) items.push([t.shipTo.title, e.checkNotPicked])
    if (p.companyName) items.push([e.checkCompany, e.checkNotFilled, true])
    return (
        <Modal title={e.checkTitle} width={400} onClose={onCancel}
            footer={<>
                <button className="btn" type="button" onClick={onCancel}>{e.cancel}</button>
                <button className="btn pri" type="button" onClick={onFix}>{e.checkFix}</button>
            </>}>
            <div className="t2" style={{ color: 'var(--muted)', marginBottom: 10 }}>{e.checkBody}</div>
            {items.map(([k, v, settings]) => (
                <div key={k} className="checkrow">
                    <span>{k}</span>
                    <span className="sp" />
                    {settings && <Link className="linkbtn" to="/customer/settings" style={{ marginRight: 10 }}>{e.checkGoSettings}</Link>}
                    <span className="bad-t">{v}</span>
                </div>
            ))}
        </Modal>
    )
}
