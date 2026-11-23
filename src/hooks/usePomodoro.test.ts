// @vitest-environment jsdom
// src/hooks/usePomodoro.test.ts
//
// 番茄鐘綁任務的驗收（規格 ①）：
//   1) 綁了待辦、focus 跑完 → onFocusComplete 被叫一次，帶的是綁的那項
//   2) 跳過不算
//   3) 白板還沒載入（ready=false）不結算，載入後才記
// 計時一律用 fake timer（真計時器在視窗被蓋住時會被節流，見 gotcha_timer_throttle）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePomodoro } from './usePomodoro'
import { POMODORO_STORAGE_KEY } from '../utils/pomodoro'

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }))

const task = { boardId: 'b1', shapeId: 'shape:t', todoId: 'x', text: '畫敵人草稿' }
const FOCUS_MS = 25 * 60_000

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-22T10:00:00'))
    localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('usePomodoro：綁任務', () => {
    it('focus 跑完 → 記到綁的待辦一次', () => {
        const onFocusComplete = vi.fn(() => true)
        const { result } = renderHook(() => usePomodoro({ ready: true, onFocusComplete }))
        act(() => result.current.onLinkTask(task))
        act(() => result.current.onStart())
        act(() => { vi.advanceTimersByTime(FOCUS_MS + 1000) })

        expect(onFocusComplete).toHaveBeenCalledTimes(1)
        expect(onFocusComplete).toHaveBeenCalledWith(task)
        expect(result.current.state.completedFocus).toBe(1)
        expect(result.current.state.phase).toBe('shortBreak')
    })

    it('休息跑完不記', () => {
        const onFocusComplete = vi.fn(() => true)
        const { result } = renderHook(() => usePomodoro({ ready: true, onFocusComplete }))
        act(() => result.current.onLinkTask(task))
        act(() => result.current.onStart())
        act(() => { vi.advanceTimersByTime(FOCUS_MS + 1000) })
        act(() => result.current.onStart())                       // 開始短休息
        act(() => { vi.advanceTimersByTime(5 * 60_000 + 1000) })
        expect(onFocusComplete).toHaveBeenCalledTimes(1)
    })

    it('跳過不算', () => {
        const onFocusComplete = vi.fn(() => true)
        const { result } = renderHook(() => usePomodoro({ ready: true, onFocusComplete }))
        act(() => result.current.onLinkTask(task))
        act(() => result.current.onStart())
        act(() => { vi.advanceTimersByTime(10 * 60_000) })
        act(() => result.current.onSkip())
        act(() => { vi.advanceTimersByTime(FOCUS_MS) })
        expect(onFocusComplete).not.toHaveBeenCalled()
        expect(result.current.state.completedFocus).toBe(0)
    })

    it('沒綁就不叫', () => {
        const onFocusComplete = vi.fn(() => true)
        const { result } = renderHook(() => usePomodoro({ ready: true, onFocusComplete }))
        act(() => result.current.onStart())
        act(() => { vi.advanceTimersByTime(FOCUS_MS + 1000) })
        expect(onFocusComplete).not.toHaveBeenCalled()
        expect(result.current.state.completedFocus).toBe(1)
    })

    it('關著 App 時跑完的那段：白板載入前不結算，載入後才記', () => {
        // 模擬上次關 App 前已經在跑、綁了待辦，且結束時刻已過
        localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify({
            phase: 'focus', presetId: 'classic', endsAt: Date.now() - 1000, pausedRemainingMs: null,
            completedFocus: 0, countedOn: '2026-11-22', linkedTask: task,
        }))
        const onFocusComplete = vi.fn(() => true)
        const { result, rerender } = renderHook(
            ({ ready }) => usePomodoro({ ready, onFocusComplete }),
            { initialProps: { ready: false } },
        )
        act(() => { vi.advanceTimersByTime(2000) })
        expect(onFocusComplete).not.toHaveBeenCalled()
        expect(result.current.state.linkedTask).toEqual(task)   // 重開綁定還在

        rerender({ ready: true })
        act(() => { vi.advanceTimersByTime(600) })
        expect(onFocusComplete).toHaveBeenCalledTimes(1)
        expect(onFocusComplete).toHaveBeenCalledWith(task)
    })
})

describe('usePomodoro：跳過／重設／換長度可以復原', () => {
    const lastToast = async () => {
        const { showToast } = await import('../utils/toast')
        const calls = vi.mocked(showToast).mock.calls
        return calls[calls.length - 1]
    }
    beforeEach(async () => {
        const { showToast } = await import('../utils/toast')
        vi.mocked(showToast).mockClear()
    })

    it('跑到一半跳過 → 給「復原」；按下去剩餘時間跟沒按過一樣', async () => {
        const { result } = renderHook(() => usePomodoro({ ready: true }))
        act(() => result.current.onStart())
        act(() => { vi.advanceTimersByTime(10 * 60_000) })
        const before = result.current.state
        act(() => result.current.onSkip())
        expect(result.current.state.phase).toBe('shortBreak')

        const [msg, , opts] = (await lastToast())!
        expect(msg).toBe('已跳過專注')
        expect(opts?.action?.label).toBe('復原')
        act(() => { vi.advanceTimersByTime(3000) })
        act(() => opts!.action!.run())
        expect(result.current.state).toEqual(before)
        // 中間那 3 秒照算：剩 15 分鐘 − 3 秒
        expect(result.current.remaining).toBe(FOCUS_MS - 10 * 60_000 - 3000)
    })

    it('重設與換長度也給復原', async () => {
        const { result } = renderHook(() => usePomodoro({ ready: true }))
        act(() => result.current.onStart())
        act(() => result.current.onReset())
        expect((await lastToast())![0]).toBe('已重設專注')
        act(() => result.current.onStart())
        act(() => result.current.onSetPreset('deep'))
        expect((await lastToast())![0]).toContain('已換成 50 / 10')
    })

    it('還沒開始就按：沒有東西會丟，不跳提示', async () => {
        const { showToast } = await import('../utils/toast')
        const { result } = renderHook(() => usePomodoro({ ready: true }))
        act(() => result.current.onSkip())
        act(() => result.current.onSetPreset('deep'))
        expect(showToast).not.toHaveBeenCalled()
    })
})
