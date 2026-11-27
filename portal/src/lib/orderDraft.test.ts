import { describe, expect, it } from 'vitest'
import type { OrderView, ShipTo } from '../services'
import {
    blankOrder, blankRow, fromOrder, hasProblems, isDirty, mergeImport, newFile, qtyInvalid, rowMissing,
    submitProblems, toSavePlan, type EditOrder,
} from './orderDraft'

const SHIP_TO: ShipTo = { country: 'DE', company: 'Acme', contact: 'Bob', phone: '+49 1', line1: 'Main 1', city: 'Berlin' }

const ORDER: OrderView = {
    id: 'o1', status: 'DRAFT', title: 'Batch', wantedDate: '2026-12-01', createdAt: '2026-11-27T00:00:00Z',
    shipTo: SHIP_TO, documents: [],
    lines: [
        {
            id: 'l1', partId: 'p1', code: 'LB-1', partName: 'Bracket', quantity: 4, material: 'AL6061',
            fulfillmentStatus: 'PENDING',
            revision: {
                id: 'r1', revNo: 1, customerRev: 'A', locked: false,
                files: [{ id: 'f1', originalFilename: 'a.pdf', uploadStatus: 'COMPLETED', sizeBytes: 10 },
                    { id: 'f2', originalFilename: 'a.step', uploadStatus: 'COMPLETED', sizeBytes: 20 }],
            },
        },
        {
            id: 'l2', partId: 'p2', fulfillmentStatus: 'PENDING',
            revision: { id: 'r2', revNo: 1, locked: false, files: [] },
        },
    ],
} as unknown as OrderView

const clone = (o: EditOrder): EditOrder => ({ ...o, rows: o.rows.map((r) => ({ ...r, files: [...r.files] })) })

describe('fromOrder', () => {
    it('turns saved lines into editable rows, missing fields become empty strings', () => {
        const e = fromOrder(ORDER)
        expect(e.title).toBe('Batch')
        expect(e.rows[0]).toMatchObject({ lineId: 'l1', code: 'LB-1', name: 'Bracket', qty: '4', customerRev: 'A', material: 'AL6061', surface: '' })
        expect(e.rows[0].files.map((f) => f.saved && f.id)).toEqual(['f1', 'f2'])
        expect(e.rows[1]).toMatchObject({ lineId: 'l2', code: '', name: '', qty: '' })
    })
})

describe('isDirty', () => {
    it('is false right after starting to edit, and ignores surrounding spaces', () => {
        const base = fromOrder(ORDER)
        const cur = clone(base)
        expect(isDirty(base, cur)).toBe(false)
        cur.rows[0] = { ...cur.rows[0], name: ' Bracket ' }
        expect(isDirty(base, cur)).toBe(false)
    })

    it('sees field edits, removed rows, removed files and new files', () => {
        const base = fromOrder(ORDER)
        const edited = clone(base)
        edited.rows[0] = { ...edited.rows[0], qty: '5' }
        expect(isDirty(base, edited)).toBe(true)

        const removed = clone(base)
        removed.rows.pop()
        expect(isDirty(base, removed)).toBe(true)

        const noFile = clone(base)
        noFile.rows[0] = { ...noFile.rows[0], files: noFile.rows[0].files.slice(1) }
        expect(isDirty(base, noFile)).toBe(true)

        const withFile = clone(base)
        withFile.rows[1] = { ...withFile.rows[1], files: [newFile(new File(['x'], 'b.pdf'))] }
        expect(isDirty(base, withFile)).toBe(true)
    })

    it('a new order with only the default address is not dirty', () => {
        expect(isDirty(blankOrder(SHIP_TO), blankOrder(SHIP_TO))).toBe(false)
        const withRow = blankOrder(SHIP_TO)
        withRow.rows.push(blankRow())
        expect(isDirty(blankOrder(SHIP_TO), withRow)).toBe(true)
    })
})

describe('toSavePlan', () => {
    it('keeps ids of saved rows, lists removed files, numbers new rows for createdLineIds', () => {
        const base = fromOrder(ORDER)
        const cur = clone(base)
        const pdf = new File(['x'], 'new.pdf')
        cur.title = '  '
        cur.rows[0] = { ...cur.rows[0], qty: ' 7 ', files: [cur.rows[0].files[1], newFile(pdf)] }
        cur.rows.splice(1, 1)
        const added = { ...blankRow(), code: 'LB-9', name: 'Plate', qty: '', files: [newFile(pdf)] }
        cur.rows.push(blankRow(), added)

        const plan = toSavePlan(base, cur)
        expect(plan.input.title).toBeNull()
        expect(plan.input.wantedDate).toBe('2026-12-01')
        expect(plan.input.lines).toEqual([
            { id: 'l1', code: 'LB-1', name: 'Bracket', quantity: 7, material: 'AL6061', surfaceTreatment: null, customerRev: 'A', removeFileIds: ['f1'] },
            { id: null, code: null, name: null, quantity: 1, material: null, surfaceTreatment: null, customerRev: null, removeFileIds: [] },
            { id: null, code: 'LB-9', name: 'Plate', quantity: null, material: null, surfaceTreatment: null, customerRev: null, removeFileIds: [] },
        ])
        expect(plan.uploads.map((u) => [u.lineId, u.newIndex, u.files.length])).toEqual([['l1', null, 1], [null, 1, 1]])
    })

    it('imported rows carry their files as uploads', () => {
        const f = new File(['x'], 'LB8.605.63529_A.pdf')
        const [row] = mergeImport([], [], [f])
        expect(row).toMatchObject({ lineId: null, code: 'LB8.605.63529', customerRev: 'A' })
        const plan = toSavePlan(blankOrder(null), { ...blankOrder(null), rows: [row] })
        expect(plan.input.lines[0].id).toBeNull()
        expect(plan.uploads).toEqual([{ lineId: null, newIndex: 0, key: row.key, files: [f] }])
    })
})

describe('mergeImport', () => {
    it('attaches drawings to saved rows with the same drawing number and keeps their line id', () => {
        const base = fromOrder(ORDER)
        const pdf = new File(['x'], 'LB-1_B.pdf')
        const step = new File(['x'], 'LB9.000.00001.step')
        const rows = mergeImport(base.rows, [{ code: 'LB9.000.00002', name: 'Plate', qty: '3' }], [pdf, step])
        // LB-1 不是 LB 加数字的图号，配不上：两份文件各自按文件名处理
        expect(rows.slice(0, 2).map((r) => r.lineId)).toEqual(['l1', 'l2'])
        expect(rows[2]).toMatchObject({ lineId: null, code: 'LB9.000.00002', name: 'Plate', qty: '3' })
        expect(rows.find((r) => r.code === 'LB9.000.00001')?.files.map((f) => f.name)).toEqual(['LB9.000.00001.step'])
    })

    it('a later drawing joins the list row with its number', () => {
        const fromList = mergeImport([], [{ code: 'LB8.605.63529', name: 'Bracket', qty: '4' }], [])
        const rows = mergeImport(fromList, [], [new File(['x'], 'LB8.605.63529_A_(非密).pdf')]) // i18n-exempt
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ code: 'LB8.605.63529', customerRev: 'A' })
        expect(rows[0].files).toHaveLength(1)
    })
})

describe('qtyInvalid', () => {
    it('allows blank and positive integers only', () => {
        expect(qtyInvalid('')).toBe(false)
        expect(qtyInvalid(' 12 ')).toBe(false)
        for (const bad of ['0', '-1', '1.5', 'abc', '1e3']) expect(qtyInvalid(bad)).toBe(true)
    })
})

describe('submit problems', () => {
    it('counts incomplete rows and rows without drawings separately', () => {
        const e = fromOrder(ORDER)
        expect(rowMissing(e.rows[0])).toEqual([])
        expect(rowMissing(e.rows[1])).toEqual(['code', 'name', 'qty', 'files'])
        const p = submitProblems({ ...e, wantedDate: '', shipTo: null }, true)
        expect(p).toEqual({ noParts: false, incompleteRows: 1, rowsWithoutDrawing: 1, wantedDate: true, shipTo: true, companyName: true })
        expect(hasProblems(p)).toBe(true)
    })

    it('a complete order has nothing to fix; an empty one does', () => {
        const e = fromOrder(ORDER)
        e.rows.pop()
        expect(hasProblems(submitProblems(e, false))).toBe(false)
        expect(submitProblems(blankOrder(SHIP_TO), false).noParts).toBe(true)
    })
})

// ---------- 补测（docs/test-cases/order-whole-page-edit.md 里标 ❌ 的） ----------

describe('orderDraft gaps', () => {
    it('#41 sees changes to the order name, delivery date and address', () => {
        const base = fromOrder(ORDER)
        expect(isDirty(base, { ...clone(base), title: 'Other' })).toBe(true)
        expect(isDirty(base, { ...clone(base), wantedDate: '2026-12-24' })).toBe(true)
        expect(isDirty(base, { ...clone(base), shipTo: { ...SHIP_TO, city: 'Bonn' } })).toBe(true)
        expect(isDirty(base, { ...clone(base), shipTo: null })).toBe(true)
    })

    it('#45 sends null when the delivery date is empty', () => {
        const base = fromOrder(ORDER)
        expect(toSavePlan(base, { ...clone(base), wantedDate: '' }).input.wantedDate).toBeNull()
    })

    it('#48 one drawing goes onto every list row with its number', () => {
        const fromList = mergeImport([], [
            { code: 'LB8.605.63529', name: 'Bracket', qty: '4' },
            { code: 'LB8.605.63529', name: 'Bracket', qty: '6' },
        ], [])
        const rows = mergeImport(fromList, [], [new File(['x'], 'LB8.605.63529_A.pdf')])
        expect(rows).toHaveLength(2)
        expect(rows.map((r) => r.files.length)).toEqual([1, 1])
    })

    it('#49 an invalid quantity counts as incomplete', () => {
        const e = fromOrder(ORDER)
        e.rows = [{ ...e.rows[0], qty: '0' }]
        expect(submitProblems(e, false).incompleteRows).toBe(1)
    })

    it('#50 a missing company name alone still blocks submit', () => {
        const e = fromOrder(ORDER)
        e.rows.pop()
        const p = submitProblems(e, true)
        expect(p).toMatchObject({ noParts: false, incompleteRows: 0, rowsWithoutDrawing: 0, wantedDate: false, shipTo: false })
        expect(hasProblems(p)).toBe(true)
    })
})
