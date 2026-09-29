// src/utils/weeklyReviewUtils.test.ts
import { describe, it, expect } from 'vitest'
import { getISOWeekKey, getWeekRange, recentWeekStarts, weekOwnerMonth, weeksOfMonth } from './weeklyReviewUtils'

describe('getISOWeekKey', () => {
    it('回傳格式為 week-YYYY-WW，週次補零', () => {
        // 2026-01-05 是 2026 年第 2 個週一
        expect(getISOWeekKey(new Date(2026, 0, 5))).toBe('week-2026-02')
    })

    it('週次號補成兩位數', () => {
        // 2026-01-01（週四）屬於 ISO 第 1 週
        expect(getISOWeekKey(new Date(2026, 0, 1))).toBe('week-2026-01')
    })

    it('年初屬於前一年最後一週時，年份歸前一年（ISO 規則）', () => {
        // 2021-01-01 是週五 → 屬於 2020 年第 53 週
        expect(getISOWeekKey(new Date(2021, 0, 1))).toBe('week-2020-53')
    })

    it('年末屬於下一年第一週時，年份歸下一年（ISO 規則）', () => {
        // 2018-12-31 是週一 → 屬於 2019 年第 1 週
        expect(getISOWeekKey(new Date(2018, 11, 31))).toBe('week-2019-01')
    })

    it('同一週內不同日期回傳相同鍵值', () => {
        const monday = getISOWeekKey(new Date(2026, 5, 1)) // 2026-06-01 週一
        const sunday = getISOWeekKey(new Date(2026, 5, 7)) // 2026-06-07 週日
        expect(monday).toBe(sunday)
    })
})

describe('getWeekRange', () => {
    it('start 為週一 00:00、end 為週日 23:59:59.999', () => {
        // 2026-06-07 是週日
        const { start, end } = getWeekRange(new Date(2026, 5, 7))

        expect(start.getDay()).toBe(1) // Monday
        expect(start.getHours()).toBe(0)
        expect(start.getMinutes()).toBe(0)
        expect(start.getDate()).toBe(1) // 2026-06-01

        expect(end.getDay()).toBe(0) // Sunday
        expect(end.getHours()).toBe(23)
        expect(end.getMinutes()).toBe(59)
        expect(end.getSeconds()).toBe(59)
        expect(end.getMilliseconds()).toBe(999)
        expect(end.getDate()).toBe(7) // 2026-06-07
    })

    it('傳入週一本身時，start 即為當天', () => {
        const { start } = getWeekRange(new Date(2026, 5, 1)) // 週一
        expect(start.getDate()).toBe(1)
        expect(start.getDay()).toBe(1)
    })

    it('end 比 start 晚 6 天又 23:59:59.999', () => {
        const { start, end } = getWeekRange(new Date(2026, 5, 3))
        const diffMs = end.getTime() - start.getTime()
        const sixDaysMs = 6 * 86400000 + (23 * 3600 + 59 * 60 + 59) * 1000 + 999
        expect(diffMs).toBe(sixDaysMs)
    })

    it('weekNum 與 getISOWeekKey 的週次號一致', () => {
        const date = new Date(2026, 5, 3)
        const { weekNum } = getWeekRange(date)
        const keyWeek = Number(getISOWeekKey(date).split('-')[2])
        expect(weekNum).toBe(keyWeek)
    })
})

describe('recentWeekStarts', () => {
    // 走勢圖的視窗：最後一格＝anchor 那一週，往左是更早的週
    it('最後一格是 anchor 所在週的週一，且每格相差 7 天', () => {
        const anchor = new Date('2026-09-29T12:00:00')   // 週二，第 40 週
        const out = recentWeekStarts(anchor, 8)
        expect(out).toHaveLength(8)
        // 最後一格 = 9/28（週一）
        expect(getWeekRange(out[7]).weekNum).toBe(getWeekRange(anchor).weekNum)
        for (const d of out) expect(d.getDay()).toBe(1)          // 全部都是週一
        for (let i = 1; i < out.length; i++) {
            expect(out[i].getTime() - out[i - 1].getTime()).toBe(7 * 86400000)
        }
    })

    it('跨年也連續（往回數會跨進前一年）', () => {
        const out = recentWeekStarts(new Date('2026-01-12T12:00:00'), 8)
        expect(out).toHaveLength(8)
        expect(out[0].getFullYear()).toBe(2025)
        for (let i = 1; i < out.length; i++) {
            expect(out[i].getTime() - out[i - 1].getTime()).toBe(7 * 86400000)
        }
    })
})

describe('weeksOfMonth / weekOwnerMonth', () => {
    const md = (ds: string) => new Date(ds + 'T12:00:00')
    const starts = (year: number, month: number) =>
        weeksOfMonth(year, month).map(d => `${d.getMonth() + 1}/${d.getDate()}`)

    it('一週歸屬看週四：第 40 週（9/28–10/4）的週四是 10/1 ⇒ 歸十月', () => {
        expect(weekOwnerMonth(md('2026-09-28'))).toEqual({ year: 2026, month: 9 })  // 10 月
        expect(weekOwnerMonth(md('2026-09-21'))).toEqual({ year: 2026, month: 8 })  // 9 月
    })

    it('2026 年 9 月剛好四週：8/31、9/7、9/14、9/21', () => {
        expect(starts(2026, 8)).toEqual(['8/31', '9/7', '9/14', '9/21'])
    })

    it('2026 年 8 月是 8/3、8/10、8/17、8/24（8/31 那週歸九月）', () => {
        expect(starts(2026, 7)).toEqual(['8/3', '8/10', '8/17', '8/24'])
    })

    // 最重要的一條：每一週只能有一個家，不能重複也不能漏掉
    it('整年掃過去，每一週剛好被算進一個月一次', () => {
        const seen = new Map<string, number>()
        for (let m = 0; m < 12; m++) {
            for (const w of weeksOfMonth(2026, m)) {
                const k = w.toDateString()
                seen.set(k, (seen.get(k) ?? 0) + 1)
            }
        }
        for (const [, n] of seen) expect(n).toBe(1)
        // 2026 有 53 個 ISO 週，扣掉跨年歸給 2025／2027 的，落在 2026 各月的應為 52
        expect(seen.size).toBeGreaterThanOrEqual(52)
    })
})
