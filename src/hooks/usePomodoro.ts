// src/hooks/usePomodoro.ts — 番茄鐘的 React 外殼
//
// 純邏輯全部在 utils/pomodoro.ts，這裡只做三件 React 才需要的事：
//   ① 持久化到 localStorage（關掉 App 再打開還在原位）
//   ② 每秒推一次重畫（**只是重畫，不是計時** —— 剩餘時間永遠由 Date.now() 對 endsAt 算）
//   ③ 到點時推進階段並通知
//
// ⚠️ 這個 hook 要掛在 App，不要掛在面板裡。面板關掉計時器必須繼續跑，
//    掛在面板裡會隨著卸載一起消失。
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
    type PomodoroState, POMODORO_STORAGE_KEY,
    parseStored, initialState, start, pause, reset, advance, setPreset,
    remainingMs, hasElapsed, isRunning, isIdle, phaseLabel, phaseDurationMs,
} from '../utils/pomodoro'
import { getTodayStr } from '../utils/date'
import { showToast } from '../utils/toast'

export interface UsePomodoro {
    state: PomodoroState
    /** 已算好的剩餘毫秒，呼叫端不必自己拿 now */
    remaining: number
    running: boolean
    idle: boolean
    totalMs: number
    onStart: () => void
    onPause: () => void
    onReset: () => void
    /** 手動跳過這一段（不計入完成數） */
    onSkip: () => void
    onSetPreset: (presetId: string) => void
}

/** 蓋住視窗時 tick 會被節流，所以只拿它重畫；1 秒是顯示需求不是計時需求。 */
const TICK_MS = 1000

export function usePomodoro(): UsePomodoro {
    const [state, setState] = useState<PomodoroState>(() => {
        try {
            return parseStored(localStorage.getItem(POMODORO_STORAGE_KEY), getTodayStr())
        } catch {
            return initialState(getTodayStr())
        }
    })
    // 純粹用來觸發重算剩餘秒數的心跳；值本身沒有意義。
    const [, setTick] = useState(0)

    useEffect(() => {
        try { localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify(state)) } catch { /* 隱私模式／配額滿：計時器照跑就好 */ }
    }, [state])

    // 沒在跑就不要每秒醒來。
    useEffect(() => {
        if (!isRunning(state)) return
        const id = setInterval(() => setTick(t => t + 1), TICK_MS)
        return () => clearInterval(id)
    }, [state])

    // 到點處理。⚠️ 用 ref 擋重入：一次 elapse 只能通知一次，
    // 否則 tick 與 re-render 會讓 toast 連噴好幾張。
    const firedRef = useRef<number | null>(null)
    useEffect(() => {
        if (!isRunning(state)) return
        const endsAt = state.endsAt!
        const check = () => {
            if (!hasElapsed(state, Date.now())) return
            if (firedRef.current === endsAt) return
            firedRef.current = endsAt

            const finished = state.phase
            const next = advance(state, getTodayStr(), true)
            setState(next)

            const msg = finished === 'focus'
                ? `專注結束，第 ${next.completedFocus} 個番茄完成 → 接著${phaseLabel(next.phase)}`
                : `${phaseLabel(finished)}結束 → 回到專注`
            showToast(msg, 'success', {
                durationMs: null,   // 人多半不在螢幕前，不能自己消失
                action: { label: `開始${phaseLabel(next.phase)}`, run: () => setState(s => start(s, Date.now())) },
            })
            // 視窗被蓋住時 toast 看不到，補一則系統通知。權限沒給就算了，不強求。
            try {
                if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    new Notification('Scout Astrolabe', { body: msg })
                }
            } catch { /* 不支援就跳過 */ }
        }
        check()
        const id = setInterval(check, 500)
        return () => clearInterval(id)
    }, [state])

    // 第一次用到時要一次權限；不阻塞、被拒也不影響功能。
    useEffect(() => {
        try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
                void Notification.requestPermission()
            }
        } catch { /* 不支援 */ }
    }, [])

    const onStart = useCallback(() => setState(s => start(s, Date.now())), [])
    const onPause = useCallback(() => setState(s => pause(s, Date.now())), [])
    const onReset = useCallback(() => setState(s => reset(s)), [])
    const onSkip = useCallback(() => setState(s => advance(s, getTodayStr(), false)), [])
    const onSetPreset = useCallback((presetId: string) => setState(s => setPreset(s, presetId)), [])

    const now = Date.now()
    const remaining = remainingMs(state, now)

    return useMemo(() => ({
        state,
        remaining,
        running: isRunning(state),
        idle: isIdle(state),
        totalMs: phaseDurationMs(state),
        onStart, onPause, onReset, onSkip, onSetPreset,
    }), [state, remaining, onStart, onPause, onReset, onSkip, onSetPreset])
}
