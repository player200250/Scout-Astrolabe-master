import { describe, it, expect } from 'vitest'
import {
    initialState, start, pause, reset, advance, setPreset,
    remainingMs, hasElapsed, isRunning, isIdle, formatRemaining, progress,
    nextPhaseAfterFocus, parseStored, phaseDurationMs, durationsOf, phaseLabel,
    LONG_BREAK_EVERY,
} from './pomodoro'

const TODAY = '2026-08-08'
const MIN = 60_000
const T0 = 1_700_000_000_000

describe('pomodoro：剩餘時間一律從絕對時刻算', () => {
    it('閒置時剩餘＝該階段完整長度', () => {
        const s = initialState(TODAY)
        expect(isIdle(s)).toBe(true)
        expect(remainingMs(s, T0)).toBe(25 * MIN)
    })

    it('開始後剩餘隨 now 減少', () => {
        const s = start(initialState(TODAY), T0)
        expect(isRunning(s)).toBe(true)
        expect(remainingMs(s, T0)).toBe(25 * MIN)
        expect(remainingMs(s, T0 + 10 * MIN)).toBe(15 * MIN)
    })

    // ⚠️ 這條是整個檔的重點：視窗被蓋住時 tick 會被節流，
    // 但因為剩餘是用 endsAt 算的，「中間完全沒有 tick」也不會影響結果。
    it('中途完全沒有 tick 也算得對（節流不影響正確性）', () => {
        const s = start(initialState(TODAY), T0)
        expect(remainingMs(s, T0 + 24 * MIN + 59_000)).toBe(1000)
        expect(remainingMs(s, T0 + 25 * MIN)).toBe(0)
    })

    it('跑過頭不會變負數', () => {
        const s = start(initialState(TODAY), T0)
        expect(remainingMs(s, T0 + 99 * MIN)).toBe(0)
        expect(hasElapsed(s, T0 + 99 * MIN)).toBe(true)
    })

    it('沒開始就不算 elapsed', () => {
        expect(hasElapsed(initialState(TODAY), T0 + 99 * MIN)).toBe(false)
    })
})

describe('pomodoro：暫停與繼續', () => {
    it('暫停記住剩餘、繼續從那裡接上', () => {
        const running = start(initialState(TODAY), T0)
        const paused = pause(running, T0 + 10 * MIN)
        expect(isRunning(paused)).toBe(false)
        expect(paused.pausedRemainingMs).toBe(15 * MIN)

        // 暫停 1 小時後才按繼續，剩餘仍是 15 分鐘（不會偷偷流逝）
        const resumed = start(paused, T0 + 70 * MIN)
        expect(remainingMs(resumed, T0 + 70 * MIN)).toBe(15 * MIN)
        expect(resumed.endsAt).toBe(T0 + 85 * MIN)
    })

    it('暫停中再暫停、進行中再開始都是 no-op', () => {
        const s = initialState(TODAY)
        expect(pause(s, T0)).toBe(s)
        const running = start(s, T0)
        expect(start(running, T0 + MIN)).toBe(running)
    })

    it('reset 回到起點但不動已完成段數', () => {
        let s = start(initialState(TODAY), T0)
        s = advance(s, TODAY, true)          // 完成一段 focus
        s = start(s, T0)
        const r = reset(s)
        expect(isIdle(r)).toBe(true)
        expect(r.completedFocus).toBe(1)
    })
})

describe('pomodoro：階段推進', () => {
    it('focus 跑完才計入段數，跳過不算', () => {
        const s = initialState(TODAY)
        expect(advance(s, TODAY, true).completedFocus).toBe(1)
        expect(advance(s, TODAY, false).completedFocus).toBe(0)
    })

    it('每四段給一次長休息', () => {
        expect(nextPhaseAfterFocus(1)).toBe('shortBreak')
        expect(nextPhaseAfterFocus(3)).toBe('shortBreak')
        expect(nextPhaseAfterFocus(LONG_BREAK_EVERY)).toBe('longBreak')
        expect(nextPhaseAfterFocus(8)).toBe('longBreak')
        expect(nextPhaseAfterFocus(0)).toBe('shortBreak')
    })

    it('連跑四段後進長休息，休息完回到專注', () => {
        let s = initialState(TODAY)
        for (let i = 0; i < 3; i++) {
            s = advance(s, TODAY, true)
            expect(s.phase).toBe('shortBreak')
            s = advance(s, TODAY, true)
        }
        s = advance(s, TODAY, true)
        expect(s.completedFocus).toBe(4)
        expect(s.phase).toBe('longBreak')
        expect(advance(s, TODAY, true).phase).toBe('focus')
    })

    it('推進後一定是閒置狀態（不會自動開始跑下一段）', () => {
        const s = advance(start(initialState(TODAY), T0), TODAY, true)
        expect(isIdle(s)).toBe(true)
    })

    it('跨日時段數歸零', () => {
        let s = initialState(TODAY)
        s = advance(s, TODAY, true)
        expect(s.completedFocus).toBe(1)
        const next = advance(s, '2026-08-09', true)
        expect(next.countedOn).toBe('2026-08-09')
        expect(next.completedFocus).toBe(0)
    })
})

describe('pomodoro：preset', () => {
    it('切 preset 會停下當前這一段', () => {
        const running = start(initialState(TODAY), T0)
        const deep = setPreset(running, 'deep')
        expect(isIdle(deep)).toBe(true)
        expect(phaseDurationMs(deep)).toBe(50 * MIN)
    })

    it('切成同一個是 no-op', () => {
        const s = initialState(TODAY)
        expect(setPreset(s, s.presetId)).toBe(s)
    })

    it('不認得的 preset 退回第一組', () => {
        expect(durationsOf('nope').focus).toBe(25 * MIN)
    })
})

describe('pomodoro：格式化', () => {
    it('mm:ss 補零', () => {
        expect(formatRemaining(25 * MIN)).toBe('25:00')
        expect(formatRemaining(9000)).toBe('00:09')
        expect(formatRemaining(0)).toBe('00:00')
        expect(formatRemaining(-5000)).toBe('00:00')
    })

    it('未滿一秒無條件進位成 1 秒（不會提早顯示 00:00）', () => {
        expect(formatRemaining(1)).toBe('00:01')
        expect(formatRemaining(999)).toBe('00:01')
    })

    it('超過一小時顯示 h:mm:ss', () => {
        expect(formatRemaining(3600_000 + 5 * MIN + 7000)).toBe('1:05:07')
    })

    it('progress 從 0 到 1', () => {
        const s = start(initialState(TODAY), T0)
        expect(progress(s, T0)).toBe(0)
        expect(progress(s, T0 + 12.5 * MIN)).toBeCloseTo(0.5)
        expect(progress(s, T0 + 99 * MIN)).toBe(1)
    })

    it('階段名稱', () => {
        expect(phaseLabel('focus')).toBe('專注')
        expect(phaseLabel('shortBreak')).toBe('短休息')
        expect(phaseLabel('longBreak')).toBe('長休息')
    })
})

describe('pomodoro：讀回持久化狀態', () => {
    it('沒存過→初始值', () => {
        expect(parseStored(null, TODAY)).toEqual(initialState(TODAY))
    })

    it('壞掉的 JSON／不合法的 phase→初始值，不丟例外', () => {
        expect(parseStored('{{{', TODAY)).toEqual(initialState(TODAY))
        expect(parseStored(JSON.stringify({ phase: 'nap' }), TODAY)).toEqual(initialState(TODAY))
    })

    it('進行中的狀態讀回來還在跑，剩餘從 endsAt 算', () => {
        const saved = JSON.stringify(start(initialState(TODAY), T0))
        const back = parseStored(saved, TODAY)
        expect(isRunning(back)).toBe(true)
        expect(remainingMs(back, T0 + 5 * MIN)).toBe(20 * MIN)
    })

    it('關掉 App 期間已經跑完 → 讀回來是「已到點」而不是負數', () => {
        const saved = JSON.stringify(start(initialState(TODAY), T0))
        const back = parseStored(saved, TODAY)
        expect(hasElapsed(back, T0 + 60 * MIN)).toBe(true)
        expect(remainingMs(back, T0 + 60 * MIN)).toBe(0)
    })

    it('endsAt 與 pausedRemainingMs 同時有值時以進行中為準', () => {
        const back = parseStored(JSON.stringify({
            phase: 'focus', presetId: 'classic', endsAt: T0 + MIN,
            pausedRemainingMs: 999, completedFocus: 0, countedOn: TODAY,
        }), TODAY)
        expect(back.pausedRemainingMs).toBeNull()
        expect(isRunning(back)).toBe(true)
    })

    it('昨天的段數不算進今天', () => {
        const back = parseStored(JSON.stringify({
            ...initialState('2026-08-07'), completedFocus: 6, countedOn: '2026-08-07',
        }), TODAY)
        expect(back.completedFocus).toBe(0)
        expect(back.countedOn).toBe(TODAY)
    })

    it('同一天的段數要留著', () => {
        const back = parseStored(JSON.stringify({
            ...initialState(TODAY), completedFocus: 3, countedOn: TODAY,
        }), TODAY)
        expect(back.completedFocus).toBe(3)
    })
})
