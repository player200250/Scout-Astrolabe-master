// src/utils/weeklyReviewUtils.test.ts
import { describe, it, expect } from 'vitest'
import { getISOWeekKey, getWeekRange } from './weeklyReviewUtils'

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
