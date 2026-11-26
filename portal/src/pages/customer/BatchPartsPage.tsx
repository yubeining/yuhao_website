/**
 * 批量添加零件（2026-11-26）：一次导入一堆图纸 / 压缩包 / 文件夹 / Excel 清单，
 * 在这里逐行确认、修改，点「保存到订单」才落库。也可以不导入，手动一行行加。
 *
 * ★ 保存之前所有东西只在浏览器里：文件不上传、解析结果不存，服务端什么都不知道（2026-11-26 拍板）。
 * ★ 列表和订单详情的零件表同列；空着的格子显示「—」，不写「必填 / 待补」（2026-11-26 拍板）。
 *   点一行弹框改，字段和单个「添加零件」一样，图纸能删能加。
 * ★ 保存走批量接口：整批一个事务建行，之后逐个传图纸；传失败的那一行显示「缺图纸」，进零件补传。
 * ★ 图号不唯一：每一行都是新零件，不和客户已有零件比对。
 */

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useConfirm } from '../../components/ConfirmDialog'
import { Field, FieldRow, Input, Req, Stepper } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Banner, Bar, Card, CardBody, CardFoot, CardHead, Empty, Hello, Page, TableWrap } from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useI18n } from '../../i18n/I18nProvider'
import { collectFiles, filesFromDrop, isSpreadsheet, readSheets, type Sheet } from '../../lib/batchFiles'
import { buildDraftRows, findHeader, rowsFromSheet, type DraftRow, type SheetColumns } from '../../lib/batchImport'
import { humanSize } from '../../lib/drawing'
import { X } from '../../lib/format'
import { addLines, ApiError, getOrder, uploadDrawing, type OrderView } from '../../services'

type Row = DraftRow<File>

/** 等客户确认列的清单 */
interface PendingList {
    file: File
    sheets: Sheet[]
    sheet: number
    /** 表头行，从 0 起 */
    header: number
    columns: SheetColumns
    found: boolean
    /** 同一次导入里的其它文件 */
    files: File[]
}

let manualSeq = 0

const ext = (name: string) => (name.split('.').pop() || '').toUpperCase()

/** 第 n 列（从 0 起）的 Excel 列名：A … Z, AA … */
const colName = (n: number) => {
    let s = ''
    for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s
    return s
}

const complete = (r: Row) => !!r.code.trim() && !!r.name.trim() && /^\d+$/.test(r.qty.trim()) && Number(r.qty) >= 1

function locate(sheets: Sheet[], sheet: number) {
    const found = findHeader(sheets[sheet]?.rows ?? [])
    return { header: found?.row ?? 0, columns: found?.columns ?? {}, found: !!found }
}

export function BatchPartsPage() {
    const { t } = useI18n()
    const b = t.customer.batchParts
    const { id = '' } = useParams()
    const navigate = useNavigate()
    const [askConfirm, confirmDialog] = useConfirm()
    const filePicker = useRef<HTMLInputElement>(null)
    const folderPicker = useRef<HTMLInputElement>(null)

    const [order, setOrder] = useState<OrderView | null>(null)
    const [missing, setMissing] = useState(false)
    const [loadErr, setLoadErr] = useState<string | null>(null)
    const [rows, setRows] = useState<Row[]>([])
    const [notes, setNotes] = useState<string[]>([])
    const [list, setList] = useState<PendingList | null>(null)
    const [editing, setEditing] = useState<{ row: Row; isNew: boolean } | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
    const [failedUploads, setFailedUploads] = useState(0)

    const load = useCallback(async () => {
        try {
            setOrder(await getOrder(id))
            setLoadErr(null)
        } catch (e) {
            if (e instanceof ApiError && (e.code === 404 || e.code === 400)) setMissing(true)
            else setLoadErr(errorText(t, e))
        }
    }, [id, t])

    useEffect(() => { void load() }, [load])

    // React 的类型里没有 webkitdirectory，只能在 DOM 上设
    useEffect(() => { folderPicker.current?.setAttribute('webkitdirectory', '') }, [order])

    const noteSkipped = (tooLarge: string[], unreadable: string[]) => {
        const next: string[] = []
        if (tooLarge.length) next.push(b.tooLarge(tooLarge))
        if (unreadable.length) next.push(b.unreadable(unreadable))
        setNotes(next)
    }

    /** 一次导入：解压、挑出第一个读得出来的清单（让客户确认列），其余文件按图号归行。 */
    const importFiles = async (raw: File[]) => {
        if (!raw.length) return
        setBusy(true)
        setErr(null)
        try {
            const got = await collectFiles(raw)
            const unreadable = [...got.unreadable]
            let files = got.files
            for (const candidate of files.filter((f) => isSpreadsheet(f.name))) {
                let sheets: Sheet[]
                try {
                    sheets = await readSheets(candidate)
                } catch {
                    unreadable.push(candidate.name)
                    continue
                }
                const sheet = Math.max(0, sheets.findIndex((s) => s.rows.length > 0))
                files = files.filter((f) => f !== candidate)
                setList({ file: candidate, sheets, sheet, ...locate(sheets, sheet), files })
                noteSkipped(got.tooLarge, unreadable)
                return
            }
            noteSkipped(got.tooLarge, unreadable)
            setRows((prev) => [...prev, ...buildDraftRows([], files)])
        } finally {
            setBusy(false)
        }
    }

    const applyList = (asList: boolean) => {
        if (!list) return
        const sheetRows = asList ? rowsFromSheet(list.sheets[list.sheet].rows, list.header, list.columns) : []
        const files = asList ? list.files : [list.file, ...list.files]
        setRows((prev) => [...prev, ...buildDraftRows(sheetRows, files)])
        setList(null)
    }

    const onDrop = async (e: DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        if (!canEdit) return
        await importFiles(await filesFromDrop(e.dataTransfer))
    }

    const addRow = () => setEditing({
        isNew: true,
        // 数量默认 1：和单个「添加零件」一样
        row: { key: `manual-${++manualSeq}`, code: '', name: '', qty: '1', customerRev: '', material: '', surface: '', files: [] },
    })

    const saveEdit = (row: Row) => {
        setRows((prev) => (editing?.isNew ? [...prev, row] : prev.map((r) => (r.key === row.key ? row : r))))
        setEditing(null)
    }

    const backOut = async () => {
        if (rows.length && !saved && !(await askConfirm(b.discardConfirm, { danger: true }))) return
        navigate(`/customer/orders/${id}`)
    }

    const save = async () => {
        setBusy(true)
        setErr(null)
        try {
            const created = await addLines(id, rows.map((r) => ({
                code: r.code.trim(), name: r.name.trim(), quantity: Number(r.qty),
                material: r.material.trim() || null, surfaceTreatment: r.surface.trim() || null,
                customerRev: r.customerRev.trim() || null,
            })))
            setSaved(true)
            const jobs = created.flatMap((line, i) => rows[i].files.map((file) => ({ line, file })))
            let failed = 0
            setProgress({ done: 0, total: jobs.length })
            for (const [i, job] of jobs.entries()) {
                try {
                    await uploadDrawing(job.line.partId, job.line.revision.id, job.file)
                } catch {
                    failed++
                }
                setProgress({ done: i + 1, total: jobs.length })
            }
            if (failed === 0) navigate(`/customer/orders/${id}`)
            else setFailedUploads(failed)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    if (missing) {
        return (
            <Page><Card><CardBody>
                <Empty text={t.customer.orderDetail.notFound}
                    action={<Link className="btn" to="/customer/orders">{t.customer.orderDetail.backToOrders}</Link>} />
            </CardBody></Card></Page>
        )
    }
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
    const canEdit = draft && !saved && !busy
    const incomplete = rows.map((r, i) => (complete(r) ? 0 : i + 1)).filter(Boolean)

    return (
        <Page>
            <Hello
                back={<button className="btn sm qui" type="button" onClick={() => void backOut()}
                    title={order.title || t.common.untitledOrder}
                    style={{ margin: '0 0 6px -9px' }}>← {b.backToOrder}</button>}
                title={b.title}
            />

            {!draft && <Banner tone="wa" style={{ marginBottom: 14 }}>{t.customer.partForm.lockedBanner}</Banner>}
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {notes.map((n) => <Banner key={n} tone="wa" style={{ marginBottom: 14 }}>{n}</Banner>)}
            {failedUploads > 0 && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>
                    {b.uploadFailed(failedUploads)}{' '}
                    <Link className="linkbtn" to={`/customer/orders/${id}`}>{b.backToOrder}</Link>
                </Banner>
            )}

            <input ref={filePicker} type="file" multiple hidden
                onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void importFiles(f) }} />
            <input ref={folderPicker} type="file" multiple hidden
                onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void importFiles(f) }} />

            <div onDragOver={(e) => { e.preventDefault(); if (canEdit) setDragOver(true) }}
                onDragLeave={() => setDragOver(false)} onDrop={(e) => void onDrop(e)}>
                <Card>
                    <CardHead title={b.partsTitle(rows.length)} right={canEdit && <>
                        <button className="btn sm" type="button" onClick={() => filePicker.current?.click()}>{b.importFiles}</button>
                        <button className="btn sm" type="button" onClick={() => folderPicker.current?.click()}>{b.importFolder}</button>
                        <button className="btn sm" type="button" onClick={addRow}>{b.addRow}</button>
                    </>} />
                    {rows.length > 0 && (
                        <CardBody flush>
                            <TableWrap className="partsTable">
                                <thead>
                                    <tr>
                                        <th className="n">#</th><th>{t.customer.orderDetail.colCode}</th><th>{t.common.table.name}</th>
                                        <th>{t.customer.orderDetail.colRevision}</th><th>{t.customer.orderDetail.colMaterial}</th>
                                        <th className="n">{t.customer.orderDetail.colQty}</th><th>{t.customer.orderDetail.colDrawing}</th><th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r, i) => (
                                        <tr key={r.key} className={canEdit ? 'clk' : undefined}
                                            onClick={canEdit ? () => setEditing({ row: { ...r, files: [...r.files] }, isNew: false }) : undefined}>
                                            <td className="n">{i + 1}</td>
                                            <td>{r.code ? <span className="m">{r.code}</span> : X}</td>
                                            <td className="t1">{r.name || X}</td>
                                            <td>{r.customerRev || X}</td>
                                            <td>{r.material || X}</td>
                                            <td className="n">{r.qty || X}</td>
                                            <td><span className={`dstat${r.files.length ? ' ok' : ' miss'}`}>
                                                <i />{r.files.length ? b.filesCount(r.files.length) : t.customer.orderDetail.drawingMissing}
                                            </span></td>
                                            <td style={{ textAlign: 'right' }}>
                                                {canEdit && (
                                                    <button className="linkbtn" type="button"
                                                        onClick={(e) => { e.stopPropagation(); setRows((prev) => prev.filter((x) => x.key !== r.key)) }}>
                                                        {t.customer.orderDetail.remove}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        </CardBody>
                    )}
                    {canEdit && (
                        <CardBody>
                            <div className="updrop" role="button" tabIndex={0}
                                style={dragOver ? { borderColor: 'var(--acc-line)', color: 'var(--acc-ink)' } : undefined}
                                onClick={() => filePicker.current?.click()}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') filePicker.current?.click() }}>
                                {!rows.length && <div className="u1">{b.emptyParts}</div>}
                                <div className="u2">{rows.length ? b.dropHint : `${b.emptyPartsSub} · ${b.dropHint}`}</div>
                            </div>
                        </CardBody>
                    )}
                    {progress && progress.total > 0 && (
                        <CardBody>
                            <div className="fnote" style={{ marginBottom: 6 }}>{b.uploading(progress.done, progress.total)}</div>
                            <Bar pct={(progress.done / progress.total) * 100} />
                        </CardBody>
                    )}
                    <CardFoot
                        left={<button className="btn" type="button" disabled={busy} onClick={() => void backOut()}>
                            {saved ? b.backToOrder : b.cancel}
                        </button>}
                        right={draft && !saved && <>
                            {incomplete.length > 0 && (
                                <span className="fnote" style={{ marginRight: 12 }}>{b.rowsIncomplete(incomplete)}</span>
                            )}
                            <button className="btn pri" type="button" onClick={() => void save()}
                                disabled={busy || !rows.length || incomplete.length > 0}>
                                {busy ? '…' : b.save}
                            </button>
                        </>}
                    />
                </Card>
            </div>

            {list && <ListColumns list={list} onChange={setList} onUse={applyList} />}
            {editing && <RowEditor row={editing.row} onCancel={() => setEditing(null)} onSave={saveEdit} />}
            {confirmDialog}
        </Page>
    )
}

/** 确认清单的列：自动认出来的先填好，客户可以改；也可以不当清单、当作普通文件。 */
function ListColumns({ list, onChange, onUse }: {
    list: PendingList
    onChange: (next: PendingList | null) => void
    onUse: (asList: boolean) => void
}) {
    const { t } = useI18n()
    const b = t.customer.batchParts
    const rows = list.sheets[list.sheet]?.rows ?? []
    const headerCells = rows[list.header] ?? []
    const width = Math.max(headerCells.length, ...rows.slice(0, 50).map((r) => r.length))
    const count = rowsFromSheet(rows, list.header, list.columns).length

    const columnSelect = (field: keyof SheetColumns, label: string) => (
        <Field label={label}>
            <select className="inp" value={list.columns[field] ?? ''}
                onChange={(e) => onChange({
                    ...list,
                    columns: { ...list.columns, [field]: e.target.value === '' ? undefined : Number(e.target.value) },
                })}>
                <option value="">{b.listNone}</option>
                {Array.from({ length: width }, (_, c) => (
                    <option key={c} value={c}>{colName(c)}{headerCells[c] ? ` · ${headerCells[c]}` : ''}</option>
                ))}
            </select>
        </Field>
    )

    return (
        <Modal title={b.listTitle(list.file.name)} width={440} onClose={() => onChange(null)}
            footer={<>
                <button className="btn" type="button" onClick={() => onUse(false)}>{b.listAsFile}</button>
                <button className="btn pri" type="button" onClick={() => onUse(true)}>{b.listUse}</button>
            </>}>
            {!list.found && <div className="fnote" style={{ marginBottom: 10 }}>{b.listNotFound}</div>}
            <FieldRow>
                {list.sheets.length > 1 && (
                    <Field label={b.listSheet}>
                        <select className="inp" value={list.sheet}
                            onChange={(e) => {
                                const sheet = Number(e.target.value)
                                onChange({ ...list, sheet, ...locate(list.sheets, sheet) })
                            }}>
                            {list.sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
                        </select>
                    </Field>
                )}
                <Field label={b.listHeaderRow}>
                    <Stepper value={String(list.header + 1)} max={Math.max(1, rows.length)}
                        onChange={(v) => {
                            const n = Number(v)
                            if (Number.isInteger(n) && n >= 1) onChange({ ...list, header: n - 1 })
                        }} />
                </Field>
            </FieldRow>
            <FieldRow cols={3}>
                {columnSelect('code', t.customer.orderDetail.colCode)}
                {columnSelect('name', t.common.table.name)}
                {columnSelect('qty', t.customer.orderDetail.colQty)}
            </FieldRow>
            <div className="fnote">{b.listRows(count)}</div>
        </Modal>
    )
}

/** 改一行：字段和单个「添加零件」一样，图纸能删能加（加的时候也能选压缩包）。 */
function RowEditor({ row, onCancel, onSave }: { row: Row; onCancel: () => void; onSave: (row: Row) => void }) {
    const { t } = useI18n()
    const b = t.customer.batchParts
    const p = t.customer.partForm
    const picker = useRef<HTMLInputElement>(null)
    const [r, setR] = useState<Row>(row)
    const [note, setNote] = useState<string | null>(null)

    const set = (k: 'code' | 'name' | 'qty' | 'material' | 'surface') => (v: string) => setR((prev) => ({ ...prev, [k]: v }))

    const addFiles = async (raw: File[]) => {
        const got = await collectFiles(raw)
        const skipped = [
            got.tooLarge.length ? b.tooLarge(got.tooLarge) : '',
            got.unreadable.length ? b.unreadable(got.unreadable) : '',
        ].filter(Boolean)
        setNote(skipped.length ? skipped.join(' ') : null)
        setR((prev) => ({ ...prev, files: [...prev.files, ...got.files] }))
    }

    return (
        <Modal title={b.editTitle} width={480} onClose={onCancel}
            footer={<>
                <button className="btn" type="button" onClick={onCancel}>{b.cancel}</button>
                <button className="btn pri" type="button" onClick={() => onSave(r)}>{p.saveEdit}</button>
            </>}>
            <FieldRow cols={3}>
                <Field label={p.fldCode} required><Input value={r.code} onChange={set('code')} /></Field>
                <Field label={t.common.table.name} required><Input value={r.name} onChange={set('name')} /></Field>
                <Field label={t.customer.quotes.colQty} required><Stepper value={r.qty} onChange={set('qty')} placeholder="" width={120} /></Field>
            </FieldRow>
            <FieldRow>
                <Field label={p.fldMaterial}><Input value={r.material} onChange={set('material')} /></Field>
                <Field label={p.fldSurface}><Input value={r.surface} onChange={set('surface')} /></Field>
            </FieldRow>
            <div className="attach">
                <input ref={picker} type="file" multiple hidden
                    onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void addFiles(f) }} />
                <div className="attach-hd">
                    <span className="attach-k">{p.drawingTitle}<Req /></span>
                    <span className="sp" />
                    <button className="btn sm" type="button" onClick={() => picker.current?.click()}>{p.chooseDrawing}</button>
                </div>
                {r.files.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                        {r.files.map((f, i) => (
                            <div className="fileRow" key={`${f.name}-${i}`}>
                                <span className="fileIco">{ext(f.name)}</span>
                                <span className="fileName" title={f.name}>{f.name}</span>
                                <span className="fileSize">{humanSize(f.size)}</span>
                                <span className="fileActs">
                                    <button type="button" className="del"
                                        onClick={() => setR((prev) => ({ ...prev, files: prev.files.filter((_, j) => j !== i) }))}>
                                        {p.removeTitle}
                                    </button>
                                </span>
                            </div>
                        ))}
                    </div>
                )}
                <div className="fnote" style={{ marginTop: 9 }}>
                    {r.files.length ? p.drawingQueuedCount(r.files.length) : p.drawingMissing}
                </div>
                {note && <div className="fnote" style={{ marginTop: 6, color: 'var(--warn)' }}>{note}</div>}
            </div>
        </Modal>
    )
}
