import { describe, it, expect } from 'vitest'
import { isPastDue, isDueToday, isOverdue, isOpenDueToday } from './dueStatus'

const T = '2026-11-23'
describe('dueStatus', () => {
    it('isPastDue：前一天算、今天不算、沒日期不算', () => {
        expect(isPastDue('2026-11-22', T)).toBe(true)
        expect(isPastDue(T, T)).toBe(false)
        expect(isPastDue('', T)).toBe(false)
        expect(isPastDue(null, T)).toBe(false)
        expect(isPastDue(undefined, T)).toBe(false)
        expect(isPastDue('2025-12-31', '2026-01-01')).toBe(true)   // 跨年
    })
    it('isDueToday', () => {
        expect(isDueToday(T, T)).toBe(true)
        expect(isDueToday('2026-11-24', T)).toBe(false)
        expect(isDueToday(null, T)).toBe(false)
    })
    it('isOverdue／isOpenDueToday：勾掉的不算', () => {
        expect(isOverdue({ dueDate: '2026-11-01' }, T)).toBe(true)
        expect(isOverdue({ dueDate: '2026-11-01', checked: true }, T)).toBe(false)
        expect(isOpenDueToday({ dueDate: T }, T)).toBe(true)
        expect(isOpenDueToday({ dueDate: T, checked: true }, T)).toBe(false)
    })
})
