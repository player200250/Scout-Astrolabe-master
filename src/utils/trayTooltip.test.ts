// src/utils/trayTooltip.test.ts — 系統匣提示文字（根目錄 trayTooltip.js）
import { describe, it, expect } from 'vitest'
import { trayTooltip, TRAY_TITLE } from '../../trayTooltip.js'

const summary = (overdueCount: number, todayCount: number, inbox: number) =>
    ({ tasks: { overdueCount, todayCount }, inbox: { count: inbox } })

describe('trayTooltip', () => {
    it('主視窗還沒就緒：只有 App 名稱', () => {
        expect(trayTooltip(null)).toBe(TRAY_TITLE)
    })

    it('今天待辦含逾期；有逾期才另外標', () => {
        expect(trayTooltip(summary(1, 2, 7))).toBe('Scout Astrolabe\n今天待辦 3・逾期 1・收件匣 7')
        expect(trayTooltip(summary(0, 2, 0))).toBe('Scout Astrolabe\n今天待辦 2・收件匣 0')
    })

    it('不超過 Windows 的 127 字上限', () => {
        expect(trayTooltip(summary(10 ** 100, 0, 10 ** 100)).length).toBeLessThanOrEqual(127)
    })
})
