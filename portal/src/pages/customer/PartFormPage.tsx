/**
 * 订单里的一个零件：新建 / 编辑，图纸在这里传。
 *
 * ★ 数据全部来自后端（2026-09-14）。
 *
 * ★ 同一图号 = 同一个零件（D16）。填完图号会查一下这个客户是不是已经有这个零件：
 *   有的话，加进订单时**沿用它上次提交时锁定的那一版图纸**（2026-09-14 拍板），不用重传。
 *
 * ★ 图纸版本在订单提交时锁定。锁定的版本不能再增删文件 ——
 *   要换图纸就「开新版本」，这一行改挂到新版本，之前的订单仍然锁着旧版本。
 *
 * ★ 传图纸会把文件名里的图号和客户版本标记填进空着的字段（设计文档 9 §3.1）。
 *   已经填过的不覆盖：客户手填的优先于从文件名猜的。
 *
 * ★ 材料 / 表面处理是自由文本：材料没有主数据表，做下拉就只能编选项（CLAUDE.md §10 C5）。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Field, FieldRow, Input, Req, Stepper } from '../../components/form'
import { FilePreviewModal, previewKindOf, type PreviewKind } from '../../components/FilePreviewModal'
import {
    Banner, Bar, Card, CardBody, CardFoot, CardHead, Empty, Fields, Fld, Hello, Page, Pill,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { humanSize, parseDrawingName } from '../../mock/drawing'
import { X } from '../../mock/format'
import {
    addLine, ApiError, filePreviewUrl, findPartByCode, getOrder, lineFileViewUrl, removeFile, startNewRevision, updateLine,
    uploadDrawing, type FileView, type OrderLineView, type OrderView, type PartView,
} from '../../services'

interface Form {
    code: string
    name: string
    qty: string
    mat: string
    surf: string
    customerRev: string
}

interface Upload {
    key: string
    name: string
    pct: number
    error?: string
}

// 数量默认 1：空着会让用户以为可以留空，点提交才报错
const EMPTY: Form = { code: '', name: '', qty: '1', mat: '', surf: '', customerRev: '' }

/** 文件名里的图号和客户版本标记，只填进还空着的字段。 */
function prefilled(prev: Form, files: File[]): Form {
    const next = { ...prev }
    for (const x of files) {
        const rev = parseDrawingName(x.name).rev
        if (!next.customerRev.trim() && rev) next.customerRev = rev
        if (!next.code.trim()) {
            const readable = x.name.match(/LB\d+(?:\.\d+)+/)
            if (readable) next.code = readable[0]
        }
    }
    return next
}

const ext = (name: string) => (name.split('.').pop() || '').toUpperCase()

export function PartFormPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const { id = '', partId = 'new' } = useParams()
    const isNew = partId === 'new'
    const picker = useRef<HTMLInputElement>(null)

    const [order, setOrder] = useState<OrderView | null>(null)
    const [missing, setMissing] = useState(false)
    const [loadErr, setLoadErr] = useState<string | null>(null)
    const [f, setF] = useState<Form>(EMPTY)
    const [existing, setExisting] = useState<PartView | null>(null)
    const [queued, setQueued] = useState<File[]>([])
    const [uploads, setUploads] = useState<Upload[]>([])
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [preview, setPreview] = useState<{ name: string; url: string; kind: PreviewKind; fileId: string } | null>(null)

    const line: OrderLineView | undefined = order?.lines.find((l) => l.id === partId)

    const load = useCallback(async (resetForm: boolean) => {
        try {
            const o = await getOrder(id)
            setOrder(o)
            const l = o.lines.find((x) => x.id === partId)
            if (l && resetForm) {
                setF({
                    code: l.code, name: l.partName, qty: String(l.quantity),
                    mat: l.material ?? '', surf: l.surfaceTreatment ?? '', customerRev: l.revision.customerRev ?? '',
                })
            }
            if (!l && partId !== 'new') setMissing(true)
            setLoadErr(null)
        } catch (e) {
            // 400 = id 不是合法格式，和 404 一样按「不存在」处理
            if (e instanceof ApiError && (e.code === 404 || e.code === 400)) setMissing(true)
            else setLoadErr(errorText(t, e))
        }
    }, [id, partId, t])

    useEffect(() => { void load(true) }, [load])

    const lookup = async (code: string) => {
        setExisting(null)
        if (!isNew || !code.trim()) return
        try {
            setExisting(await findPartByCode(code.trim()))
        } catch (e) {
            if (!(e instanceof ApiError && e.code === 404)) setErr(errorText(t, e))
        }
    }

    const set = (k: keyof Form) => (v: string) => {
        setF((prev) => ({ ...prev, [k]: v }))
        setErr(null)
    }

    /** 传到这一行当前挂的版本；版本已锁定就先开新版本（「换图纸」）。 */
    const uploadTo = async (target: OrderLineView, files: File[], customerRev: string) => {
        setBusy(true)
        try {
            let revision = target.revision
            if (revision.locked) {
                revision = (await startNewRevision(id, target.id, customerRev.trim() || null)).revision
            }
            for (const file of files) {
                const key = `${file.name}-${file.size}-${Date.now()}`
                setUploads((u) => [...u, { key, name: file.name, pct: 0 }])
                try {
                    await uploadDrawing(target.partId, revision.id, file, (loaded, total) =>
                        setUploads((u) => u.map((x) => (x.key === key
                            ? { ...x, pct: Math.round((loaded / Math.max(1, total)) * 100) } : x))))
                    setUploads((u) => u.filter((x) => x.key !== key))
                } catch (e) {
                    setUploads((u) => u.map((x) => (x.key === key ? { ...x, error: errorText(t, e, t.customer.partForm.uploadFailed) } : x)))
                }
            }
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
            await load(false)
        }
    }

    const pick = (list: FileList | null) => {
        const chosen = Array.from(list ?? [])
        if (picker.current) picker.current.value = ''
        if (!chosen.length) return
        const next = prefilled(f, chosen)
        setF(next)
        if (isNew) {
            setQueued((prev) => [...prev, ...chosen.filter((x) => !prev.some((p) => p.name === x.name))])
            if (next.code !== f.code) void lookup(next.code)
        } else if (line) {
            void uploadTo(line, chosen, next.customerRev)
        }
    }

    /** 有未保存改动时点返回先确认，避免直接丢输入。 */
    const dirty = !isNew && !!line && (
        f.name.trim() !== line.partName.trim()
        || Number(f.qty) !== line.quantity
        || f.mat.trim() !== (line.material ?? '').trim()
        || f.surf.trim() !== (line.surfaceTreatment ?? '').trim()
    )
    const hasInput = isNew && (
        !!f.code.trim() || !!f.name.trim() || !!f.mat.trim() || !!f.surf.trim() || queued.length > 0
    )

    const backOut = () => {
        if ((dirty || hasInput) && !window.confirm(t.customer.partForm.discardConfirm)) return
        navigate(`/customer/orders/${id}`)
    }

    const save = async () => {
        const qty = Number(f.qty)
        if (!f.code.trim() || !f.name.trim() || !Number.isInteger(qty) || qty < 1) {
            setErr(t.customer.partForm.errRequired)
            return
        }
        const body = {
            name: f.name.trim(), quantity: qty,
            material: f.mat.trim() || null, surfaceTreatment: f.surf.trim() || null,
        }
        setBusy(true)
        setErr(null)
        try {
            if (isNew) {
                const created = await addLine(id, { ...body, code: f.code.trim(), customerRev: f.customerRev.trim() || null })
                if (queued.length) await uploadTo(created, queued, f.customerRev)
                setQueued([])
                navigate(`/customer/orders/${id}/parts/${created.id}`, { replace: true })
            } else if (line) {
                await updateLine(id, line.id, body)
                navigate(`/customer/orders/${id}`)
            }
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const openPreview = async (file: FileView) => {
        const kind = previewKindOf(file.originalFilename)
        if (!kind) return
        try {
            const { url } = await filePreviewUrl(file.id)
            setPreview({ name: file.originalFilename, url, kind, fileId: file.id })
        } catch (e) {
            setErr(errorText(t, e))
        }
    }

    const view = async (file: FileView) => {
        if (!line) return
        try {
            // 下载链接带 Content-Disposition: attachment，浏览器直接存文件，不会离开本页
            window.location.assign((await lineFileViewUrl(id, line.id, file.id)).url)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }

    const remove = async (file: FileView) => {
        try {
            await removeFile(file.id)
            await load(false)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }

    if (missing) {
        return (
            <Page>
                <Card><CardBody>
                    <Empty text={t.customer.partForm.notFound} action={<Link className="btn" to={`/customer/orders/${id}`}>← {t.customer.partForm.backToOrder}</Link>} />
                </CardBody></Card>
            </Page>
        )
    }
    if (!order) {
        return (
            <Page><Card><CardBody>
                {loadErr
                    ? <Empty text={loadErr} action={<button className="btn" type="button" onClick={() => void load(true)}>{t.common.retry}</button>} />
                    : <Empty text={t.common.loading} />}
            </CardBody></Card></Page>
        )
    }

    const draft = order.status === 'DRAFT'
    const locked = line?.revision.locked ?? false
    const reused = existing?.revisions.filter((r) => r.locked).sort((a, b) => b.revNo - a.revNo)[0]

    return (
        <Page>
            <Hello
                back={<Link className="btn sm qui" to={`/customer/orders/${order.id}`}
                    title={order.title || t.common.untitledOrder}
                    style={{ margin: '0 0 6px -9px' }}>← {t.customer.partForm.backToOrder}</Link>}
                title={isNew ? t.customer.partForm.titleNew : draft ? t.customer.partForm.titleEdit : (line?.partName ?? t.customer.partForm.titlePart)}
                sub={line ? `${line.code} · ${t.customer.partForm.versionOnly(line.revision.revNo)}` : undefined}
            />

            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {isNew && !draft && <Banner tone="wa" style={{ marginBottom: 14 }}>{t.customer.partForm.lockedBanner}</Banner>}
            {isNew && existing && (
                <Banner tone="in" style={{ marginBottom: 14 }}>
                    {reused
                        ? t.customer.partForm.reuseExisting(existing.name, reused.revNo, reused.files.length)
                            + (queued.length ? t.customer.partForm.reuseNewVersionQueued : '')
                        : t.customer.partForm.reuseNewVersion(existing.name)}
                </Banner>
            )}

            <Card>
                <CardHead title={t.customer.partForm.infoTitle} />
                <CardBody>
                    <input ref={picker} type="file" multiple hidden onChange={(e) => pick(e.target.files)} />

                    {draft ? (
                        <>
                            <FieldRow cols={isNew ? 3 : 2}>
                                {/* 图号只在新增时可填；已有零件的图号已经在标题下方，不再占一个字段 */}
                                {isNew && (
                                    <Field label={t.customer.partForm.fldCode} required>
                                        <Input value={f.code} onChange={set('code')} onBlur={() => void lookup(f.code)} />
                                        {/* ★ 图号是零件身份：重复使用会复用已有零件，必须写出来 */}
                                        <div className="fnote" style={{ marginTop: 6 }}>{t.customer.partForm.codeHint}</div>
                                    </Field>
                                )}
                                <Field label={t.common.table.name} required><Input value={f.name} onChange={set('name')} /></Field>
                                <Field label={t.customer.quotes.colQty} required><Stepper value={f.qty} onChange={set('qty')} placeholder="" width={170} /></Field>
                            </FieldRow>
                            <FieldRow>
                                <Field label={t.customer.partForm.fldMaterial}><Input value={f.mat} onChange={set('mat')} /></Field>
                                <Field label={t.customer.partForm.fldSurface}><Input value={f.surf} onChange={set('surf')} /></Field>
                            </FieldRow>
                        </>
                    ) : line && (
                        <Fields>
                            <Fld k={t.customer.partForm.fldCode.replace(' *', '')} v={line.code} mono />
                            <Fld k={t.common.table.name} v={line.partName} />
                            <Fld k={t.customer.quotes.colQty} v={line.quantity} mono />
                            <Fld k={t.customer.orderDetail.colRevision} v={`v${line.revision.revNo}${line.revision.customerRev ? ` · ${line.revision.customerRev}` : ''}`} mono />
                            <Fld k={t.customer.partForm.fldMaterial} v={line.material || X} />
                            <Fld k={t.customer.partForm.fldSurface} v={line.surfaceTreatment || X} />
                        </Fields>
                    )}

                    <div className="attach">
                        <div className="attach-hd">
                            <span className="attach-k">{t.customer.partForm.drawingTitle}<Req /></span>
                            {line && locked && <Pill tone="ne" dot={false}>{t.customer.partForm.lockedPill(line.revision.revNo)}</Pill>}
                            <span className="sp" />
                            {draft && (
                                <button className="btn sm" type="button" disabled={busy} onClick={() => picker.current?.click()}>
                                    {!isNew && locked ? t.customer.partForm.replaceDrawing : t.customer.partForm.chooseDrawing}
                                </button>
                            )}
                        </div>

                        {isNew && queued.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                                {queued.map((x) => (
                                    <div className="fileRow" key={x.name}>
                                        <span className="fileIco">{ext(x.name)}</span>
                                        <span className="fileName" title={x.name}>{x.name}</span>
                                        <span className="fileSize">{humanSize(x.size)}</span>
                                        <span className="fileActs">
                                            <button type="button" className="del" title={t.customer.partForm.removeTitle}
                                                onClick={() => setQueued((prev) => prev.filter((y) => y.name !== x.name))}>
                                                {t.customer.partForm.removeTitle}
                                            </button>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {line && line.revision.files.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                                {line.revision.files.map((x) => {
                                    const kind = previewKindOf(x.originalFilename)
                                    return (
                                        <div className="fileRow" key={x.id}>
                                            <span className="fileIco">{ext(x.originalFilename)}</span>
                                            <span className="fileName" title={x.originalFilename}>{x.originalFilename}</span>
                                            <span className="fileSize">{x.sizeBytes != null ? humanSize(x.sizeBytes) : X}</span>
                                            <span className="fileActs">
                                                <button type="button" disabled={!kind}
                                                    title={kind ? undefined : t.customer.partForm.previewUnsupported}
                                                    onClick={() => void openPreview(x)}>{t.customer.partForm.preview}</button>
                                                <button type="button" onClick={() => void view(x)}>{t.customer.partForm.download}</button>
                                                {draft && !locked && (
                                                    <button type="button" className="del" title={t.customer.partForm.removeTitle}
                                                        onClick={() => void remove(x)}>{t.customer.partForm.removeTitle}</button>
                                                )}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        <div className="fnote" style={{ marginTop: 9 }}>
                            {(() => {
                                const uploaded = line?.revision.files.length ?? 0
                                if (uploaded > 0) return t.customer.partForm.drawingUploadedCount(uploaded)
                                if (queued.length > 0) return t.customer.partForm.drawingQueuedCount(queued.length)
                                return t.customer.partForm.drawingMissing
                            })()}
                        </div>

                        {uploads.map((u) => (
                            <div className="fileRow" key={u.key}>
                                <span className="fileIco">{ext(u.name)}</span>
                                <span className="fileName" title={u.name}>{u.name}</span>
                                <span className="fileSize">{u.error ?? `${u.pct}%`}</span>
                                <span className="fileActs" style={{ width: 90 }}>
                                    {!u.error && <Bar pct={u.pct} />}
                                </span>
                            </div>
                        ))}
                    </div>
                </CardBody>
                {draft && (
                    <CardFoot
                        left={<button className="btn" type="button" onClick={backOut}>{isNew ? t.customer.partForm.cancel : t.customer.partForm.backToOrder}</button>}
                        right={<>
                            {isNew && <span className="fnote" style={{ marginRight: 12 }}>{t.customer.partForm.addHint}</span>}
                            <button className="btn pri" type="button" onClick={save} disabled={busy || (!isNew && !dirty)}>
                                {isNew ? t.customer.partForm.addToOrder : t.customer.partForm.saveEdit}
                            </button>
                        </>}
                    />
                )}
            </Card>

            {preview && (
                <FilePreviewModal
                    name={preview.name}
                    url={preview.url}
                    kind={preview.kind}
                    onClose={() => setPreview(null)}
                    onDownload={() => {
                        const f = line?.revision.files.find((x) => x.id === preview.fileId)
                        if (f) void view(f)
                    }}
                />
            )}
        </Page>
    )
}
