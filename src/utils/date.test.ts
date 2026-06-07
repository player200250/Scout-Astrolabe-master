// src/utils/date.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { toDateStr, formatDueDate, formatRelativeDate } from './date'

// ── toDateStr：完全純函式，不需凍結時間 ───────────────────────────────────
describe('toDateStr', () => {
    it('格式化為 YYYY-MM-DD，月日補零', () => {
        // 月份從 0 起算：第 5 個參數 5 = 6 月
        expect(toDateStr(new Date(2026, 5, 7))).toBe('2026-06-07')
    })

    it('雙位數月日不補零', () => {
        expect(toDateStr(new Date(2026, 11, 25))).toBe('2026-12-25')
    })
})

// ── formatDueDate / formatRelativeDate：依賴「現在」，需凍結時間 ──────────
describe('依賴當下時間的函式（凍結時間）', () => {
    beforeEach(() => {
        // 把「現在」固定成 2026-06-07 12:00:00，測試才可重現
        vi.useFakeTimers()
        vi.setSystemTime(new Date(2026, 5, 7, 12, 0, 0))
    })

    afterEach(() => {
        // 還原真實時鐘，避免影響其他測試
        vi.useRealTimers()
    })

    describe('formatDueDate', () => {
        it('到期日等於今天時回傳「今天」', () => {
            expect(formatDueDate('2026-06-07', '2026-06-07')).toBe('今天')
        })

        it('同一年的其他日期回傳 M/D（不含年）', () => {
            expect(formatDueDate('2026-08-15', '2026-06-07')).toBe('8/15')
        })

        it('不同年的日期回傳 Y/M/D', () => {
            expect(formatDueDate('2027-01-01', '2026-06-07')).toBe('2027/1/1')
        })
    })

    describe('formatRelativeDate', () => {
        const now = new Date(2026, 5, 7, 12, 0, 0).getTime()

        it('一分鐘內回傳「剛剛」', () => {
            expect(formatRelativeDate(now - 30 * 1000)).toBe('剛剛')
        })

        it('一小時內回傳「N 分鐘前」', () => {
            expect(formatRelativeDate(now - 5 * 60000)).toBe('5 分鐘前')
        })

        it('一天內回傳「N 小時前」', () => {
            expect(formatRelativeDate(now - 3 * 3600000)).toBe('3 小時前')
        })

        it('一週內回傳「N 天前」', () => {
            expect(formatRelativeDate(now - 2 * 86400000)).toBe('2 天前')
        })

        it('超過一週回傳 M/D 日期', () => {
            expect(formatRelativeDate(now - 10 * 86400000)).toBe('5/28')
        })
    })
})
