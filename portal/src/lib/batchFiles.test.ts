import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { collectFiles, filesFromDrop, readSheets } from './batchFiles'
import { findHeader, MAX_FILE_BYTES, rowsFromSheet } from './batchImport'

// 下面的中文是客户清单表头和文件名的样本数据，不是界面文案
// i18n-exempt-start
const SAMPLE = [
    ['江苏昱昊机械有限公司 暂定价合同'],
    [],
    ['序号', '图号', '名称', '数量'],
    [1, 'LB8.605.63529', '支架', 4],
    [2, 'LB8.034.60696', '端盖', 12],
]
const EXPECTED_ROWS = [
    { code: 'LB8.605.63529', name: '支架', qty: '4', material: '', surface: '' },
    { code: 'LB8.034.60696', name: '端盖', qty: '12', material: '', surface: '' },
]
/** 「垫圈」的 GBK 编码 */
const GBK_DIANQUAN = [0xb5, 0xe6, 0xc8, 0xa6]
// i18n-exempt-end

const PDF = new TextEncoder().encode('%PDF-1.4\n%%EOF\n')

function workbookFile(bookType: XLSX.BookType, name: string, sheets: Record<string, unknown[][]>): File {
    const book = XLSX.utils.book_new()
    for (const [sheetName, rows] of Object.entries(sheets)) {
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), sheetName)
    }
    return new File([XLSX.write(book, { type: 'array', bookType })], name)
}

function parse(sheet: string[][]) {
    const header = findHeader(sheet)
    expect(header).not.toBeNull()
    return rowsFromSheet(sheet, header!.row, header!.columns)
}

describe('readSheets', () => {
    it('reads an .xlsx parts list, numbers come back as the text shown in Excel', async () => {
        const [sheet] = await readSheets(workbookFile('xlsx', 'list.xlsx', { Sheet1: SAMPLE }))
        expect(parse(sheet.rows)).toEqual(EXPECTED_ROWS)
    })

    it('reads an old .xls (BIFF8) parts list', async () => {
        const [sheet] = await readSheets(workbookFile('biff8', 'list.xls', { Sheet1: SAMPLE }))
        expect(parse(sheet.rows)).toEqual(EXPECTED_ROWS)
    })

    it('keeps every sheet with its name', async () => {
        const sheets = await readSheets(workbookFile('xlsx', 'two.xlsx', { Cover: [['x']], Parts: SAMPLE }))
        expect(sheets.map((s) => s.name)).toEqual(['Cover', 'Parts'])
        expect(parse(sheets[1].rows)).toEqual(EXPECTED_ROWS)
    })

    it('reads a UTF-8 csv with a BOM (Excel "CSV UTF-8")', async () => {
        const text = '﻿' + SAMPLE.map((r) => r.join(',')).join('\n')
        const [sheet] = await readSheets(new File([new TextEncoder().encode(text)], 'list.csv'))
        expect(parse(sheet.rows)).toEqual(EXPECTED_ROWS)
    })

    it('falls back to GBK for a csv saved by Chinese Excel', async () => {
        // 序号,图号,名称,数量 / 1,LB1.234.56789,垫圈,7 —— 中文部分手工写 GBK 字节
        const bytes = [
            ...[0xd0, 0xf2, 0xba, 0xc5], 0x2c, ...[0xcd, 0xbc, 0xba, 0xc5], 0x2c, ...[0xc3, 0xfb, 0xb3, 0xc6], 0x2c, ...[0xca, 0xfd, 0xc1, 0xbf], 0x0a,
            ...new TextEncoder().encode('1,LB1.234.56789,'), ...GBK_DIANQUAN, ...new TextEncoder().encode(',7\n'),
        ]
        const [sheet] = await readSheets(new File([new Uint8Array(bytes)], 'gbk.csv'))
        expect(parse(sheet.rows)).toEqual([{ code: 'LB1.234.56789', name: '垫圈', qty: '7', material: '', surface: '' }]) // i18n-exempt
    })
})

describe('collectFiles', () => {
    it('unzips one level, keeps base names, skips folders and macOS junk', async () => {
        const zip = new JSZip()
        zip.file('drawings/sub/LB8.605.63529_A.pdf', PDF)
        zip.file('drawings/860563529.par', PDF)
        zip.file('__MACOSX/drawings/._LB8.605.63529_A.pdf', 'junk')
        zip.file('drawings/.DS_Store', 'junk')
        zip.folder('empty')
        const file = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'all.zip')

        const got = await collectFiles([file, new File([PDF], 'loose.pdf')])
        expect(got.files.map((f) => f.name).sort()).toEqual(['860563529.par', 'LB8.605.63529_A.pdf', 'loose.pdf'])
        expect(new Uint8Array(await got.files.find((f) => f.name === '860563529.par')!.arrayBuffer())).toEqual(PDF)
        expect(got.tooLarge).toEqual([])
        expect(got.unreadable).toEqual([])
    })

    it('decodes GBK file names from zips made on Chinese Windows', async () => {
        const zip = new JSZip()
        zip.file('LB860062384-x.pdf', PDF)
        const raw = new Uint8Array([...new TextEncoder().encode('LB860062384-'), ...GBK_DIANQUAN, ...new TextEncoder().encode('.pdf')])
        // 文件名按 GBK 字节写进去，不带 UTF-8 标记
        const data = await zip.generateAsync({ type: 'arraybuffer', encodeFileName: () => raw as unknown as string })
        const got = await collectFiles([new File([data], 'gbk.zip')])
        expect(got.files.map((f) => f.name)).toEqual(['LB860062384-垫圈.pdf']) // i18n-exempt
    })

    it('rejects files over 20MB, inside or outside a zip, but not a big zip itself', async () => {
        const big = new Uint8Array(MAX_FILE_BYTES + 1)
        const zip = new JSZip()
        zip.file('huge.step', big)
        zip.file('ok.pdf', PDF)
        const zipped = new File([await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })], 'pack.zip')

        const got = await collectFiles([new File([big], 'big.pdf'), new File([new Uint8Array(MAX_FILE_BYTES)], 'edge.pdf'), zipped])
        expect(got.tooLarge.sort()).toEqual(['big.pdf', 'huge.step'])
        expect(got.files.map((f) => f.name).sort()).toEqual(['edge.pdf', 'ok.pdf'])
    })

    it('reports a broken zip instead of failing the whole import', async () => {
        const got = await collectFiles([new File([PDF], 'broken.zip'), new File([PDF], 'a.pdf')])
        expect(got.unreadable).toEqual(['broken.zip'])
        expect(got.files.map((f) => f.name)).toEqual(['a.pdf'])
    })
})

describe('filesFromDrop', () => {
    type Entry = { isFile: boolean; isDirectory: boolean; name: string; file?: (ok: (f: File) => void) => void; createReader?: () => unknown }
    const fileEntry = (name: string): Entry => ({ isFile: true, isDirectory: false, name, file: (ok) => ok(new File([PDF], name)) })
    /** 模拟浏览器：readEntries 每次最多给 100 个，读完给空数组 */
    const dirEntry = (name: string, children: Entry[]): Entry => ({
        isFile: false, isDirectory: true, name,
        createReader: () => {
            let pos = 0
            return {
                readEntries: (ok: (e: Entry[]) => void) => {
                    const batch = children.slice(pos, pos + 100)
                    pos += batch.length
                    ok(batch)
                },
            }
        },
    })
    const transfer = (entries: Entry[], files: File[] = []) => ({
        items: entries.map((e) => ({ kind: 'file', webkitGetAsEntry: () => e })),
        files,
    }) as unknown as DataTransfer

    it('walks nested folders and reads past the 100-entry batch limit', async () => {
        const many = Array.from({ length: 150 }, (_, i) => fileEntry(`f${i}.pdf`))
        const dt = transfer([dirEntry('root', [dirEntry('inner', many), fileEntry('top.pdf')]), fileEntry('loose.pdf')])
        const files = await filesFromDrop(dt)
        expect(files).toHaveLength(152)
        expect(files.map((f) => f.name)).toContain('f149.pdf')
        expect(files.map((f) => f.name)).toContain('top.pdf')
    })

    it('falls back to dataTransfer.files when the browser gives no entries', async () => {
        const dt = { items: [], files: [new File([PDF], 'a.pdf')] } as unknown as DataTransfer
        expect((await filesFromDrop(dt)).map((f) => f.name)).toEqual(['a.pdf'])
    })
})
