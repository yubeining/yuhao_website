import { describe, expect, it } from 'vitest'
import { buildDraftRows, findHeader, nameFromFileName, rowsFromSheet, MAX_FILE_BYTES } from './batchImport'

const file = (name: string, size = 10) => ({ name, size })

// 下面的中文是客户清单表头和图纸文件名的样本数据（来自设计文档 9 的真实样本），不是界面文案
// i18n-exempt-start

describe('findHeader', () => {
    it('finds the header row below a title block and maps the known Chinese headers', () => {
        const sheet = [
            ['江苏昱昊机械有限公司 暂定价合同'],
            [],
            ['序号', '任务编号', '系统号', '课题号', '图号', '名称', '数量', '含税单价'],
            ['1', 'T1', 'S1', 'K1', 'LB8.605.63529', '支架', '4', '12.5'],
        ]
        expect(findHeader(sheet)).toEqual({ row: 2, columns: { code: 4, name: 5, qty: 6 } })
    })

    it('ignores surrounding whitespace in header cells', () => {
        expect(findHeader([[' 图号 ', '名 称', '数量']])?.columns).toEqual({ code: 0, name: 1, qty: 2 })
    })

    it('returns null when no row looks like a header', () => {
        expect(findHeader([['a', 'b'], ['1', '2']])).toBeNull()
    })
})

describe('rowsFromSheet', () => {
    it('reads the rows under the header and skips blank and total rows', () => {
        // 样本最后一行是合并单元格 A60:H60 写总价，内容落在序号列
        const sheet = [
            ['序号', '图号', '名称', '数量'],
            ['1', 'LB8.605.63529', '支架', 4],
            ['', '', '', ''],
            ['合计：64062.85'],
            ['3', 'LB8.034.60696', ' 端盖 ', '2'],
        ]
        expect(rowsFromSheet(sheet, 0, { code: 1, name: 2, qty: 3 })).toEqual([
            { code: 'LB8.605.63529', name: '支架', qty: '4' },
            { code: 'LB8.034.60696', name: '端盖', qty: '2' },
        ])
    })

    it('leaves a field empty when its column is not mapped', () => {
        expect(rowsFromSheet([['图号'], ['LB1.234.56789']], 0, { code: 0 })).toEqual([
            { code: 'LB1.234.56789', name: '', qty: '' },
        ])
    })
})

describe('nameFromFileName', () => {
    it('takes the text after a compact drawing number', () => {
        expect(nameFromFileName('LB860062384-垫圈.pdf')).toBe('垫圈')
        expect(nameFromFileName('LB8.322.60012定滑轮.pdf')).toBe('定滑轮')
    })

    it('returns empty for other naming styles', () => {
        expect(nameFromFileName('模型_4_1_LB8.605.63529_A_(密级为空)_860563529.par')).toBe('')
        expect(nameFromFileName('835460372.par')).toBe('')
    })
})

describe('buildDraftRows', () => {
    it('groups files with the same drawing number into one row', () => {
        const rows = buildDraftRows([], [
            file('模型_4_1_LB8.605.63529_A_(密级为空)_860563529.par'),
            file('A2_dft_7_1_LB8.605.63529_A_(非密)_860563529_print.pdf'),
            file('LB8.034.60696.pdf'),
        ])
        expect(rows).toHaveLength(2)
        expect(rows[0]).toMatchObject({ code: 'LB8.605.63529', customerRev: 'A', qty: '' })
        expect(rows[0].files).toHaveLength(2)
        expect(rows[1].files).toHaveLength(1)
    })

    it('puts every unrecognised file on its own row with an empty drawing number', () => {
        const rows = buildDraftRows([], [file("GB9074'8_3X8.prt"), file('readme.txt')])
        expect(rows.map((r) => [r.code, r.files.length])).toEqual([['', 1], ['', 1]])
    })

    it('does not invent a readable drawing number for purely numeric file names', () => {
        const rows = buildDraftRows([], [file('835460372.par')])
        expect(rows[0].code).toBe('')
        expect(rows[0].files).toHaveLength(1)
    })

    it('attaches matching files to list rows and copies them to every row with the same number', () => {
        const rows = buildDraftRows(
            [
                { code: 'LB8.605.63529', name: '支架', qty: '4' },
                { code: 'LB8.605.63529', name: '支架', qty: '6' },
                { code: 'LB8.110.70031', name: '垫块', qty: '6' },
            ],
            [file('835460372.par'), file('860563529.par'), file('LB8.605.63529_B_(非密).pdf')],
        )
        expect(rows).toHaveLength(4)
        expect(rows[0]).toMatchObject({ name: '支架', qty: '4', customerRev: 'B' })
        expect(rows[0].files.map((f) => f.name)).toEqual(['860563529.par', 'LB8.605.63529_B_(非密).pdf'])
        expect(rows[1].files).toHaveLength(2)
        expect(rows[2].files).toHaveLength(0)
        // 清单里没有的文件自己成一行，排在清单行后面
        expect(rows[3]).toMatchObject({ code: '', files: [{ name: '835460372.par' }] })
    })

    it('fills the name and the drawing number as written from the compact file name style', () => {
        const [row] = buildDraftRows([], [file('LB860062384-垫圈.pdf')])
        expect(row).toMatchObject({ code: 'LB860062384', name: '垫圈' })
    })

    it('prefers the dotted drawing number when both styles are in one group', () => {
        const [row] = buildDraftRows([], [file('LB860062384-垫圈.pdf'), file('LB8.600.62384_A_(非密).pdf')])
        expect(row.code).toBe('LB8.600.62384')
    })

    it('gives every row a distinct key', () => {
        const rows = buildDraftRows([{ code: 'A', name: '', qty: '' }, { code: 'A', name: '', qty: '' }], [])
        expect(new Set(rows.map((r) => r.key)).size).toBe(2)
    })
})

describe('MAX_FILE_BYTES', () => {
    it('matches the 20MB single file limit of the backend', () => {
        expect(MAX_FILE_BYTES).toBe(20 * 1024 * 1024)
    })
})
// i18n-exempt-end
