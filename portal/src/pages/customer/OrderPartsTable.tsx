/**
 * 订单页的零件卡片（2026-11-27 整页编辑）：只读时是零件表；点页面上的「编辑」后，每个格子变成输入框，
 * 能加行、删行、导入文件 / 文件夹 / 压缩包 / 清单，图纸在行下面展开，能删能加。
 *
 * ★ 这里只改编辑中的副本（父组件的 EditOrder），什么都不发给服务端；保存由页面底部的「保存」统一做。
 * ★ 导入规则沿用 2026-11-26 批量添加：浏览器里解析，同图号合成一行，认不出图号的文件一个一行，
 *   清单表头只认「序号 / 图号 / 名称 / 数量」，认不出就让客户自己选列。
 * ★ 草稿里不提示必填（2026-11-27）：只有提交时点了「去完善」才把缺的格子标红（showMissing）。
 */

import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Field, FieldRow, Stepper } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Banner, Card, CardBody, CardFoot, CardHead, pill, TableWrap } from '../../components/ui'
import { useI18n } from '../../i18n/I18nProvider'
import { collectFiles, filesFromDrop, isSpreadsheet, readSheets, type Sheet } from '../../lib/batchFiles'
import { findHeader, pickSheet, rowsFromSheet, type SheetColumns } from '../../lib/batchImport'
import { X } from '../../lib/format'
import {
    blankRow, mergeImport, newFile, qtyInvalid, rowMissing, type EditRow, type RowFile, type SavedFile,
} from '../../lib/orderDraft'
import type { OrderLineView } from '../../services'
import { lineFulfillSt } from './status'

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

/** 第 n 列（从 0 起）的 Excel 列名：A … Z, AA … */
const colName = (n: number) => {
    let s = ''
    for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s
    return s
}

function locate(sheets: Sheet[], sheet: number) {
    const found = findHeader(sheets[sheet]?.rows ?? [])
    return { header: found?.row ?? 0, columns: found?.columns ?? {}, found: !!found }
}

type TextField = 'code' | 'name' | 'customerRev' | 'material' | 'surface' | 'qty'

export function OrderPartsTable({ rows, editing, onRowsChange, showMissing, showQtyErrors, failedFiles, lines, inProduction, onPreview, busy }: {
    rows: EditRow[]
    /** 编辑状态 */
    editing: boolean
    onRowsChange: (next: EditRow[]) => void
    /** 提交时点了「去完善」：把缺的格子标红 */
    showMissing: boolean
    /** 点了保存但有数量不是正整数：只把这些数量格标红（不连带标别的空格子） */
    showQtyErrors: boolean
    /** 上次保存没传上去的文件（标红） */
    failedFiles: Set<File>
    /** 已保存的行（只读时显示进度用） */
    lines: OrderLineView[]
    inProduction: boolean
    onPreview: (lineId: string, file: SavedFile) => void
    busy: boolean
}) {
    const { t } = useI18n()
    const e = t.customer.orderEdit
    const d = t.customer.orderDetail
    const filePicker = useRef<HTMLInputElement>(null)
    const folderPicker = useRef<HTMLInputElement>(null)
    const rowFilePicker = useRef<HTMLInputElement>(null)
    const [rowTarget, setRowTarget] = useState<string | null>(null)
    const [open, setOpen] = useState<Set<string>>(new Set())
    const [list, setList] = useState<PendingList | null>(null)
    const [notes, setNotes] = useState<string[]>([])
    const [dragOver, setDragOver] = useState(false)
    const [reading, setReading] = useState(false)

    // React 的类型里没有 webkitdirectory，只能在 DOM 上设
    useEffect(() => { folderPicker.current?.setAttribute('webkitdirectory', '') }, [editing])
    // 退出编辑时收起提示
    useEffect(() => { if (!editing) { setNotes([]); setList(null) } }, [editing])

    const canEdit = editing && !busy && !reading

    const noteSkipped = (tooLarge: string[], unreadable: string[]) => {
        const next: string[] = []
        if (tooLarge.length) next.push(e.tooLarge(tooLarge))
        if (unreadable.length) next.push(e.unreadable(unreadable))
        setNotes(next)
    }

    /** 一次导入：解压、挑出第一个读得出来的清单（让客户确认列），其余文件按图号归行。 */
    const importFiles = async (raw: File[]) => {
        if (!raw.length) return
        setReading(true)
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
                const sheet = pickSheet(sheets)
                files = files.filter((f) => f !== candidate)
                setList({ file: candidate, sheets, sheet, ...locate(sheets, sheet), files })
                noteSkipped(got.tooLarge, unreadable)
                return
            }
            noteSkipped(got.tooLarge, unreadable)
            onRowsChange(mergeImport(rows, [], files))
        } finally {
            setReading(false)
        }
    }

    const applyList = (asList: boolean) => {
        if (!list) return
        const sheetRows = asList ? rowsFromSheet(list.sheets[list.sheet].rows, list.header, list.columns) : []
        onRowsChange(mergeImport(rows, sheetRows, asList ? list.files : [list.file, ...list.files]))
        setList(null)
    }

    /** 给某一行加图纸（也能选压缩包，解开后全挂到这一行）。 */
    const addRowFiles = async (key: string, raw: File[]) => {
        if (!raw.length) return
        const got = await collectFiles(raw)
        noteSkipped(got.tooLarge, got.unreadable)
        onRowsChange(rows.map((r) => (r.key === key ? { ...r, files: [...r.files, ...got.files.map(newFile)] } : r)))
        setOpen((o) => new Set(o).add(key))
    }

    const onDrop = async (ev: DragEvent) => {
        ev.preventDefault()
        setDragOver(false)
        if (!canEdit) return
        await importFiles(await filesFromDrop(ev.dataTransfer))
    }

    const setField = (key: string, field: TextField, v: string) =>
        onRowsChange(rows.map((r) => (r.key === key ? { ...r, [field]: v } : r)))
    const removeFile = (key: string, f: RowFile) =>
        onRowsChange(rows.map((r) => (r.key === key ? { ...r, files: r.files.filter((x) => x !== f) } : r)))
    const toggle = (key: string) => setOpen((o) => {
        const n = new Set(o)
        if (n.has(key)) n.delete(key)
        else n.add(key)
        return n
    })
    const label: Record<TextField, string> = {
        code: d.colCode, name: t.common.table.name, customerRev: d.colRevision,
        material: d.colMaterial, surface: e.colSurface, qty: d.colQty,
    }
    const lineOf = (lineId: string | null) => (lineId ? lines.find((l) => l.id === lineId) : undefined)

    const head = (
        <tr>
            <th className="n">#</th><th>{d.colCode}</th><th>{t.common.table.name}</th><th>{d.colRevision}</th>
            <th>{d.colMaterial}</th><th>{e.colSurface}</th><th className="n">{d.colQty}</th><th>{d.colDrawing}</th>
            {inProduction && !editing && <th>{d.colProgress}</th>}<th />
        </tr>
    )
    const colCount = 9 + (inProduction && !editing ? 1 : 0)

    const addFileButton = (key: string, bad = false) => (
        <button className={`btn sm${bad ? ' bad' : ''}`} type="button" title={e.addFile} aria-label={e.addFile} disabled={!canEdit}
            onClick={() => { setRowTarget(key); rowFilePicker.current?.click() }}>＋</button>
    )

    const fileChip = (r: EditRow, f: RowFile, i: number) => (
        <span key={f.saved ? f.id : `${f.name}-${i}`} className={`fchip${!f.saved && failedFiles.has(f.file) ? ' bad' : ''}`}>
            {f.saved && r.lineId
                ? <button type="button" className="linkbtn" onClick={() => onPreview(r.lineId!, f)}>{f.name}</button>
                : <span>{f.name}</span>}
            {editing && (
                <button type="button" className="x" title={e.removeFile} aria-label={e.removeFile} disabled={!canEdit}
                    onClick={() => removeFile(r.key, f)}>×</button>
            )}
        </span>
    )

    const body = rows.map((r, i) => {
        const missing = showMissing ? rowMissing(r) : []
        const fl = r.files.length
        const expanded = open.has(r.key) && fl > 0
        const toggleBtn = (
            <button className={`linkbtn${editing ? '' : ' dstat ok'}`} type="button" onClick={() => toggle(r.key)}>
                {!editing && <i />}{e.filesCount(fl)} {expanded ? '▴' : '▾'}
            </button>
        )
        const cell = (field: TextField, extra = '') => (
            <input className={`inp${extra}${(missing as string[]).includes(field) || (field === 'qty' && showQtyErrors && qtyInvalid(r.qty)) ? ' bad' : ''}`}
                value={r[field]} disabled={!canEdit} aria-label={label[field]}
                onChange={(ev) => setField(r.key, field, ev.target.value)} />
        )
        const line = lineOf(r.lineId)
        return [
            editing ? (
                <tr key={r.key} className={r.lineId ? undefined : 'isnew'}>
                    <td className="n">{i + 1}</td>
                    <td>{cell('code', ' m')}</td>
                    <td>{cell('name')}</td>
                    <td>{cell('customerRev')}</td>
                    <td>{cell('material')}</td>
                    <td>{cell('surface')}</td>
                    <td>{cell('qty', ' n')}</td>
                    <td>{fl ? toggleBtn : addFileButton(r.key, missing.includes('files'))}</td>
                    <td style={{ textAlign: 'right' }}>
                        <button className="linkbtn" type="button" disabled={!canEdit}
                            onClick={() => onRowsChange(rows.filter((x) => x.key !== r.key))}>{d.remove}</button>
                    </td>
                </tr>
            ) : (
                <tr key={r.key}>
                    <td className="n">{i + 1}</td>
                    <td>{r.code ? <span className="m">{r.code}</span> : X}</td>
                    <td className="t1">{r.name || X}</td>
                    {/* 只显示客户自己标的版本；系统内部的第 N 版对客户没有意义（2026-11-18 去掉） */}
                    <td>{r.customerRev || X}</td>
                    <td>{r.material || X}</td>
                    <td>{r.surface || X}</td>
                    <td className="n">{r.qty || X}</td>
                    <td>{fl ? toggleBtn : <span className="dstat miss"><i />{d.drawingMissing}</span>}</td>
                    {inProduction && <td>{line ? pill(lineFulfillSt(t)[line.fulfillmentStatus]) : X}</td>}
                    <td />
                </tr>
            ),
            expanded && (
                <tr key={`${r.key}-files`} className="ptfiles">
                    <td />
                    <td colSpan={colCount - 1}>
                        {r.files.map((f, j) => fileChip(r, f, j))}
                        {editing && addFileButton(r.key)}
                    </td>
                </tr>
            ),
        ]
    })

    return (
        <div onDragOver={(ev) => { if (!editing) return; ev.preventDefault(); if (canEdit) setDragOver(true) }}
            onDragLeave={() => setDragOver(false)} onDrop={(ev) => void onDrop(ev)}>
            <input ref={filePicker} type="file" multiple hidden
                onChange={(ev) => { const f = Array.from(ev.target.files ?? []); ev.target.value = ''; void importFiles(f) }} />
            <input ref={folderPicker} type="file" multiple hidden
                onChange={(ev) => { const f = Array.from(ev.target.files ?? []); ev.target.value = ''; void importFiles(f) }} />
            <input ref={rowFilePicker} type="file" multiple hidden
                onChange={(ev) => {
                    const f = Array.from(ev.target.files ?? [])
                    ev.target.value = ''
                    if (rowTarget) void addRowFiles(rowTarget, f)
                }} />
            <Card style={{ marginBottom: 16 }}>
                <CardHead title={d.partsTitle(rows.length)} />
                {notes.map((n) => <CardBody key={n}><Banner tone="wa">{n}</Banner></CardBody>)}
                {rows.length > 0 && (
                    <CardBody flush>
                        <TableWrap className={`partsTable${editing ? ' editing' : ''}`}>
                            <thead>{head}</thead>
                            <tbody>{body}</tbody>
                        </TableWrap>
                    </CardBody>
                )}
                {rows.length === 0 && editing && (
                    <CardBody>
                        <div className={`updrop${dragOver ? ' over' : ''}`} role="button" tabIndex={0}
                            onClick={() => { if (canEdit) filePicker.current?.click() }}
                            onKeyDown={(ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && canEdit) filePicker.current?.click() }}>
                            <div className="u1">{e.emptyParts}</div>
                            <div className="u2">{`${e.emptyPartsSub} · ${e.dropHint}`}</div>
                        </div>
                    </CardBody>
                )}
                {rows.length === 0 && !editing && (
                    <CardBody><div className="t2" style={{ color: 'var(--muted)' }}>{e.emptyParts}</div></CardBody>
                )}
                {editing && (
                    <CardFoot left={<>
                        <button className="btn" type="button" disabled={!canEdit}
                            onClick={() => onRowsChange([...rows, blankRow()])}>{d.addPart}</button>
                        {' '}<button className="btn" type="button" disabled={!canEdit}
                            onClick={() => filePicker.current?.click()}>{e.importFiles}</button>
                        {' '}<button className="btn" type="button" disabled={!canEdit}
                            onClick={() => folderPicker.current?.click()}>{e.importFolder}</button>
                    </>} />
                )}
            </Card>
            {list && <ListColumns list={list} onChange={setList} onUse={applyList} />}
        </div>
    )
}

/** 确认清单的列：自动认出来的先填好，客户可以改；也可以不当清单、当作普通文件。 */
function ListColumns({ list, onChange, onUse }: {
    list: PendingList
    onChange: (next: PendingList | null) => void
    onUse: (asList: boolean) => void
}) {
    const { t } = useI18n()
    const e = t.customer.orderEdit
    const rows = list.sheets[list.sheet]?.rows ?? []
    const headerCells = rows[list.header] ?? []
    const width = Math.max(headerCells.length, ...rows.slice(0, 50).map((r) => r.length))
    const count = rowsFromSheet(rows, list.header, list.columns).length

    const columnSelect = (field: keyof SheetColumns, label: string) => (
        <Field label={label}>
            <select className="inp" value={list.columns[field] ?? ''}
                onChange={(ev) => onChange({
                    ...list,
                    columns: { ...list.columns, [field]: ev.target.value === '' ? undefined : Number(ev.target.value) },
                })}>
                <option value="">{e.listNone}</option>
                {Array.from({ length: width }, (_, c) => (
                    <option key={c} value={c}>{colName(c)}{headerCells[c] ? ` · ${headerCells[c]}` : ''}</option>
                ))}
            </select>
        </Field>
    )

    return (
        <Modal title={e.listTitle(list.file.name)} width={440} onClose={() => onChange(null)}
            footer={<>
                <button className="btn" type="button" onClick={() => onUse(false)}>{e.listAsFile}</button>
                <button className="btn pri" type="button" onClick={() => onUse(true)}>{e.listUse}</button>
            </>}>
            {!list.found && <div className="fnote" style={{ marginBottom: 10 }}>{e.listNotFound}</div>}
            <FieldRow>
                {list.sheets.length > 1 && (
                    <Field label={e.listSheet}>
                        <select className="inp" value={list.sheet}
                            onChange={(ev) => {
                                const sheet = Number(ev.target.value)
                                onChange({ ...list, sheet, ...locate(list.sheets, sheet) })
                            }}>
                            {list.sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
                        </select>
                    </Field>
                )}
                <Field label={e.listHeaderRow}>
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
            <div className="fnote">{e.listRows(count)}</div>
        </Modal>
    )
}
