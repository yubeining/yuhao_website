import { describe, expect, it } from 'vitest'
import { monthCells } from './DatePicker'

const isRealDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

// 日历上灰色的上月 / 下月格子跨年时，以前会算出 2026-13-01、2027-00-28 这种不存在的日期（2026-11-27 修）
describe('monthCells', () => {
    it('gives next month days in December the following year', () => {
        const dec = monthCells(2026, 11)
        const after = dec.filter((c) => c.out && c.day < 15)
        expect(after[0].iso).toBe('2027-01-01')
        expect(after.every((c) => c.iso.startsWith('2027-01-'))).toBe(true)
    })

    it('gives previous month days in January the year before', () => {
        const jan = monthCells(2027, 0)
        const before = jan.filter((c) => c.out && c.day > 15)
        expect(before.length).toBeGreaterThan(0)
        expect(before.every((c) => c.iso.startsWith('2026-12-'))).toBe(true)
        expect(before[before.length - 1].iso).toBe('2026-12-31')
    })

    it('only ever produces real dates, 42 cells, across a whole year', () => {
        for (let m = 0; m < 12; m++) {
            const cells = monthCells(2026, m)
            expect(cells).toHaveLength(42)
            expect(cells.filter((c) => !isRealDate(c.iso))).toEqual([])
        }
    })

    it('keeps in-month days as they are', () => {
        const nov = monthCells(2026, 10).filter((c) => !c.out)
        expect(nov).toHaveLength(30)
        expect(nov[0].iso).toBe('2026-11-01')
        expect(nov[29].iso).toBe('2026-11-30')
    })
})
