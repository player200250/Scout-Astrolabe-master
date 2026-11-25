// @vitest-environment jsdom
// src/utils/focusLog.test.ts — P2-5：週回顧的「本週專注」
import { describe, it, expect, beforeEach } from 'vitest'
import { addFocus, sumFocus, parseFocusLog, recordFocus, loadFocusLog, FOCUS_LOG_KEY } from './focusLog'

beforeEach(() => localStorage.clear())

describe('focusLog', () => {
    it('同一天累加次數與分鐘', () => {
        let log = addFocus({}, '2026-11-25', 25)
        log = addFocus(log, '2026-11-25', 50)
        expect(log['2026-11-25']).toEqual({ count: 2, minutes: 75 })
    })

    it('區間合計含頭尾、不含區間外', () => {
        const log = { '2026-11-23': { count: 1, minutes: 25 }, '2026-11-24': { count: 2, minutes: 50 }, '2026-11-30': { count: 9, minutes: 225 }, '2026-11-17': { count: 4, minutes: 100 } }
        expect(sumFocus(log, '2026-11-23', '2026-11-29')).toEqual({ count: 3, minutes: 75 })
        expect(sumFocus(log, '2026-12-01', '2026-12-07')).toEqual({ count: 0, minutes: 0 })
    })

    it('超過 400 天的舊紀錄會被丟掉', () => {
        const log = addFocus({ '2024-01-01': { count: 1, minutes: 25 } }, '2026-11-25', 25)
        expect(Object.keys(log)).toEqual(['2026-11-25'])
    })

    it('壞掉的資料不會讓它崩潰', () => {
        expect(parseFocusLog('not json')).toEqual({})
        expect(parseFocusLog('{"2026-11-25":{"count":"x"},"bad":{"count":1,"minutes":1}}')).toEqual({})
    })

    it('recordFocus 寫進 localStorage，讀得回來', () => {
        recordFocus('2026-11-25', 25)
        expect(loadFocusLog()).toEqual({ '2026-11-25': { count: 1, minutes: 25 } })
        expect(localStorage.getItem(FOCUS_LOG_KEY)).toContain('2026-11-25')
    })
})
