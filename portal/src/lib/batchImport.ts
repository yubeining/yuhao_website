/**
 * 批量添加零件：把一批文件（图纸 + 可选的 Excel / CSV 清单）变成待确认的零件行。
 *
 * ★ 全部在浏览器里做。客户点「保存到订单」之前，服务端不收任何东西（2026-11-26 拍板）。
 * ★ 这里只有纯函数（不碰 File 内容、不碰第三方库），读文件 / 解压在 batchFiles.ts。
 *
 * 规则来源（2026-11-26 逐条拍板）：
 *   - 同一批里同图号的文件合成一行；认不出图号的文件一个一行
 *   - 清单表头先只认「序号 / 图号 / 名称 / 数量」四个词，客户可以改列
 *   - 2026-11-27 加读「材料」「表面处理」两列（需求方原话：清单导入要读这两列）
 *   - 清单里两行同图号：各算一行，这个图号的文件每行都挂一份
 *   - 图号不唯一，不和客户已有零件比对
 */

import { normalizePartNo, parseDrawingName, readablePartNo } from './drawing'

/** 单个文件上限，和后端 spring.servlet.multipart.max-file-size 一致。压缩包本身不受限，只限解开后的每个文件。 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024

/** 清单里各字段在第几列（从 0 起）。没对上的字段为空。 */
export interface SheetColumns {
    code?: number
    name?: number
    qty?: number
    material?: number
    surface?: number
}

export interface SheetRow {
    code: string
    name: string
    qty: string
    /** 清单里没有这一列、或者没对上时为空 */
    material?: string
    surface?: string
}

export interface DraftRow<F extends { name: string; size: number }> {
    key: string
    code: string
    name: string
    /** 原样保留客户写的数量，保存时才校验是不是正整数 */
    qty: string
    customerRev: string
    material: string
    surface: string
    files: F[]
}

/**
 * 表头词 → 字段。序号只用来认表头行，不落任何字段。
 * 这是拿来匹配客户清单表头的数据，不是界面文案，所以不进 i18n 字典（2026-11-26：先只认这四个中文词；11-27 加材料、表面处理）。
 */
// i18n-exempt-start
const HEADER_WORDS: Record<string, keyof SheetColumns | null> = {
    序号: null,
    图号: 'code',
    名称: 'name',
    数量: 'qty',
    材料: 'material',
    表面处理: 'surface',
}
// i18n-exempt-end

/** 表头很少在第一行（前面常有公司抬头），只在前面这么多行里找。 */
const HEADER_SCAN_ROWS = 30

const cell = (v: unknown) => (v == null ? '' : String(v).trim())

/** 找表头行：第一行命中至少两个表头词的就是。找不到返回 null，让客户自己对列。 */
export function findHeader(sheet: unknown[][]): { row: number; columns: SheetColumns } | null {
    for (let r = 0; r < Math.min(sheet.length, HEADER_SCAN_ROWS); r++) {
        const columns: SheetColumns = {}
        let hits = 0
        ;(sheet[r] ?? []).forEach((v, c) => {
            const word = cell(v).replace(/\s+/g, '')
            if (!(word in HEADER_WORDS)) return
            hits++
            const field = HEADER_WORDS[word]
            if (field && columns[field] === undefined) columns[field] = c
        })
        if (hits >= 2) return { row: r, columns }
    }
    return null
}

/** 表头下面的数据行。图号、名称、数量三列全空的行（空行、写在别的列的合计行）跳过。 */
export function rowsFromSheet(sheet: unknown[][], headerRow: number, columns: SheetColumns): SheetRow[] {
    const pick = (row: unknown[], c: number | undefined) => (c === undefined ? '' : cell(row[c]))
    return sheet.slice(headerRow + 1)
        .map((row) => ({
            code: pick(row, columns.code), name: pick(row, columns.name), qty: pick(row, columns.qty),
            material: pick(row, columns.material), surface: pick(row, columns.surface),
        }))
        .filter((r) => r.code || r.name || r.qty)
}

/**
 * 只认文档 9 §4.3 的「紧凑写法」：`LB860062384-垫圈` / `LB8.322.60012定滑轮`，图号后面就是名称。
 * 其它风格的文件名里图号后面跟的是版本、密级，不是名称，一律返回空。
 */
export function nameFromFileName(fileName: string): string {
    const base = fileName.replace(/\.[^.]+$/, '')
    if (/(LB[\d.]*\d)(?:_([A-Z0-9]{1,3}))?(?=_[（(]|_|$)/.test(base)) return ''
    const m = base.match(/LB[\d.]{6,}/)
    if (!m || m.index === undefined) return ''
    return base.slice(m.index + m[0].length).replace(/^[-_\s]+/, '').trim()
}

let seq = 0
const nextKey = () => `row-${++seq}`

/**
 * 清单行 + 文件 → 待确认的零件行。顺序：清单行按清单顺序在前，清单里没有的图号组其次，认不出图号的文件最后。
 *
 * ★ 纯数字文件名（`860563529.par`）能按数字串配上清单行，但不会被拿来当图号写进行里 ——
 *   还原出来的 `LB8.605.63529` 是我方推的，不是客户写的（同 drawing.ts readablePartNo）。
 */
export function buildDraftRows<F extends { name: string; size: number }>(sheetRows: SheetRow[], files: F[]): DraftRow<F>[] {
    interface Group { partNo: string; name: string; rev: string; files: F[]; used: boolean }
    const groups = new Map<string, Group>()
    const loose: F[] = []

    for (const f of files) {
        const { partDigits, rev } = parseDrawingName(f.name)
        if (!partDigits) {
            loose.push(f)
            continue
        }
        let g = groups.get(partDigits)
        if (!g) {
            g = { partNo: '', name: '', rev: '', files: [], used: false }
            groups.set(partDigits, g)
        }
        g.files.push(f)
        if (rev && !g.rev) g.rev = rev
        // 带点的写法优先；紧凑写法 LB860062384 也是客户写在文件名里的原文，可以用（纯数字的不行）
        const written = readablePartNo(f.name) || (f.name.match(/LB\d{6,}/)?.[0] ?? '')
        if (written.length > g.partNo.length) g.partNo = written
        if (!g.name) g.name = nameFromFileName(f.name)
    }

    const empty = { material: '', surface: '' }
    const rows: DraftRow<F>[] = sheetRows.map((s) => {
        const digits = normalizePartNo(s.code)
        const g = digits ? groups.get(digits) : undefined
        if (g) g.used = true
        return {
            key: nextKey(), code: s.code, name: s.name, qty: s.qty, material: s.material ?? '', surface: s.surface ?? '',
            customerRev: g?.rev ?? '', files: g ? [...g.files] : [],
        }
    })
    for (const g of groups.values()) {
        if (g.used) continue
        rows.push({ key: nextKey(), code: g.partNo, name: g.name, qty: '', customerRev: g.rev, ...empty, files: g.files })
    }
    for (const f of loose) {
        rows.push({ key: nextKey(), code: '', name: '', qty: '', customerRev: '', ...empty, files: [f] })
    }
    return rows
}

/** 默认用哪张工作表：第一张认得出表头的；都认不出就第一张非空的（前面常有封面页）。 */
export function pickSheet(sheets: { rows: unknown[][] }[]): number {
    const withHeader = sheets.findIndex((s) => findHeader(s.rows))
    if (withHeader >= 0) return withHeader
    return Math.max(0, sheets.findIndex((s) => s.rows.length > 0))
}

/**
 * 后导入的文件先按图号配到已有的行上：同图号的每一行都挂一份（和清单里同图号两行的规则一致），
 * 行上没填客户版本的顺手从文件名补上。配不上的文件原样返回，交给 buildDraftRows 另开行。
 */
export function attachToRows<F extends { name: string; size: number }>(rows: DraftRow<F>[], files: F[]): { rows: DraftRow<F>[]; rest: F[] } {
    const rest: F[] = []
    let next = rows
    for (const f of files) {
        const { partDigits, rev } = parseDrawingName(f.name)
        const hit = (r: DraftRow<F>) => !!partDigits && normalizePartNo(r.code) === partDigits
        if (!next.some(hit)) {
            rest.push(f)
            continue
        }
        next = next.map((r) => (hit(r) ? { ...r, files: [...r.files, f], customerRev: r.customerRev || rev } : r))
    }
    return { rows: next, rest }
}
