/**
 * 订单页整页编辑（2026-11-27）：编辑中的整张订单、和已保存版本比有没有改动、组保存请求、提交前缺什么。
 *
 * ★ 只有纯函数，不碰网络、不碰 React。规则来源（2026-11-27 逐条拍板）：
 *   - 零件、订单信息、收货地址一起编辑一起保存；取消 = 撤销这一轮全部改动
 *   - 草稿随便存，不提示必填；提交时才检查：零件（图号 / 名称 / 数量 / 图纸）、交期、地址、公司名称
 *   - 删行、删文件都等保存才生效
 */

import type { OrderView, SaveOrderInput, ShipTo } from '../services'
import { attachToRows, buildDraftRows, type DraftRow, type SheetRow } from './batchImport'

/** 已经存在服务端的图纸 */
export interface SavedFile {
    saved: true
    id: string
    name: string
    size: number
}

/** 这次新选的、还没上传的图纸 */
export interface NewFile {
    saved: false
    file: File
    name: string
    size: number
}

export type RowFile = SavedFile | NewFile

/** 编辑中的一行。lineId 为空 = 这次新加的行。 */
export interface EditRow extends DraftRow<RowFile> {
    lineId: string | null
}

export interface EditOrder {
    title: string
    /** yyyy-MM-dd，空串 = 没填 */
    wantedDate: string
    shipTo: ShipTo | null
    rows: EditRow[]
}

export const newFile = (file: File): NewFile => ({ saved: false, file, name: file.name, size: file.size })

let seq = 0
const nextKey = () => `edit-${++seq}`

/** 已保存的订单 → 编辑起点。 */
export function fromOrder(order: OrderView): EditOrder {
    return {
        title: order.title ?? '',
        wantedDate: order.wantedDate ?? '',
        shipTo: order.shipTo ?? null,
        rows: order.lines.map((l) => ({
            key: l.id,
            lineId: l.id,
            code: l.code ?? '',
            name: l.partName ?? '',
            qty: l.quantity == null ? '' : String(l.quantity),
            customerRev: l.revision.customerRev ?? '',
            material: l.material ?? '',
            surface: l.surfaceTreatment ?? '',
            files: l.revision.files.map((f) => ({ saved: true, id: f.id, name: f.originalFilename, size: f.sizeBytes ?? 0 })),
        })),
    }
}

/** 新建订单的起点：带上地址簿里的默认地址（2026-11-27）。 */
export function blankOrder(defaultShipTo: ShipTo | null): EditOrder {
    return { title: '', wantedDate: '', shipTo: defaultShipTo, rows: [] }
}

/** 手动加的一行：数量默认 1（和原来的单个添加一样）。 */
export function blankRow(): EditRow {
    return { key: nextKey(), lineId: null, code: '', name: '', qty: '1', customerRev: '', material: '', surface: '', files: [] }
}

/**
 * 把一次导入并进正在编辑的行（2026-11-26 批量添加的规则不变）：清单行先接在后面，文件再按图号配到所有同图号的行上
 * （包括已保存的行和之前导入的行），配不上的文件按图号归组另开行。
 */
export function mergeImport(prev: EditRow[], sheetRows: SheetRow[], files: File[]): EditRow[] {
    const asNew = (r: DraftRow<RowFile>): EditRow => ({ ...r, key: nextKey(), lineId: null })
    const listRows = buildDraftRows<RowFile>(sheetRows, []).map(asNew)
    const { rows, rest } = attachToRows<RowFile>([...prev, ...listRows], files.map(newFile))
    return [...(rows as EditRow[]), ...buildDraftRows<RowFile>([], rest).map(asNew)]
}

const trim = (s: string) => s.trim()

/** 填了的数量必须是正整数；空着可以（草稿随便存）。 */
export function qtyInvalid(qty: string): boolean {
    const q = qty.trim()
    return q !== '' && !(/^\d+$/.test(q) && Number(q) > 0)
}

function comparable(o: EditOrder) {
    return JSON.stringify({
        title: trim(o.title),
        wantedDate: o.wantedDate,
        shipTo: o.shipTo,
        rows: o.rows.map((r) => ({
            lineId: r.lineId,
            code: trim(r.code),
            name: trim(r.name),
            qty: trim(r.qty),
            customerRev: trim(r.customerRev),
            material: trim(r.material),
            surface: trim(r.surface),
            // 新文件按对象本身比较：同名的两份新文件也是不同的改动
            files: r.files.map((f) => (f.saved ? f.id : f)),
        })),
    }, (_k, v) => (v instanceof File ? `${v.name}:${v.size}:${v.lastModified}` : v))
}

/** 和编辑前比有没有改动。 */
export function isDirty(base: EditOrder, cur: EditOrder): boolean {
    return comparable(base) !== comparable(cur)
}

/** 一次保存的请求体 + 保存之后还要传的图纸。 */
export interface SavePlan {
    input: SaveOrderInput
    /** 每项是一行要传的新图纸。lineId 是已有行；newIndex 是第几个新行（对 createdLineIds） */
    uploads: { lineId: string | null; newIndex: number | null; key: string; files: File[] }[]
}

const nullIfBlank = (s: string) => (s.trim() === '' ? null : s.trim())

/** 编辑结果 → 整张保存的请求。调用前先确认没有 {@link qtyInvalid} 的行。 */
export function toSavePlan(base: EditOrder, cur: EditOrder): SavePlan {
    const savedBefore = new Map(base.rows.filter((r) => r.lineId).map((r) => [r.lineId!, r]))
    let newIndex = 0
    const uploads: SavePlan['uploads'] = []
    const lines = cur.rows.map((r) => {
        const keptIds = new Set(r.files.filter((f): f is SavedFile => f.saved).map((f) => f.id))
        const before = r.lineId ? savedBefore.get(r.lineId) : undefined
        const removeFileIds = (before?.files ?? []).filter((f): f is SavedFile => f.saved && !keptIds.has(f.id)).map((f) => f.id)
        const pending = r.files.filter((f): f is NewFile => !f.saved).map((f) => f.file)
        const idx = r.lineId ? null : newIndex++
        if (pending.length) uploads.push({ lineId: r.lineId, newIndex: idx, key: r.key, files: pending })
        return {
            id: r.lineId,
            code: nullIfBlank(r.code),
            name: nullIfBlank(r.name),
            quantity: r.qty.trim() === '' ? null : Number(r.qty.trim()),
            material: nullIfBlank(r.material),
            surfaceTreatment: nullIfBlank(r.surface),
            customerRev: nullIfBlank(r.customerRev),
            removeFileIds,
        }
    })
    return {
        input: { title: nullIfBlank(cur.title), wantedDate: cur.wantedDate || null, shipTo: cur.shipTo, lines },
        uploads,
    }
}

/** 一行提交前还缺什么（编辑状态下标红用）。 */
export type RowField = 'code' | 'name' | 'qty' | 'files'

export function rowMissing(r: Pick<EditRow, 'code' | 'name' | 'qty' | 'files'>): RowField[] {
    const miss: RowField[] = []
    if (!r.code.trim()) miss.push('code')
    if (!r.name.trim()) miss.push('name')
    if (r.qty.trim() === '' || qtyInvalid(r.qty)) miss.push('qty')
    if (!r.files.length) miss.push('files')
    return miss
}

/** 提交前缺的东西（弹框只列项目，不逐行列）。 */
export interface SubmitProblems {
    noParts: boolean
    /** 图号 / 名称 / 数量没填齐的行数 */
    incompleteRows: number
    /** 没有图纸的行数 */
    rowsWithoutDrawing: number
    wantedDate: boolean
    shipTo: boolean
    companyName: boolean
}

export function submitProblems(order: EditOrder, companyNameMissing: boolean): SubmitProblems {
    const misses = order.rows.map(rowMissing)
    return {
        noParts: order.rows.length === 0,
        incompleteRows: misses.filter((m) => m.some((f) => f !== 'files')).length,
        rowsWithoutDrawing: misses.filter((m) => m.includes('files')).length,
        wantedDate: !order.wantedDate,
        shipTo: !order.shipTo,
        companyName: companyNameMissing,
    }
}

export function hasProblems(p: SubmitProblems): boolean {
    return p.noParts || p.incompleteRows > 0 || p.rowsWithoutDrawing > 0 || p.wantedDate || p.shipTo || p.companyName
}
