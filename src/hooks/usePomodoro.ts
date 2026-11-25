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
    type PomodoroState, type LinkedTask, POMODORO_STORAGE_KEY,
    parseStored, initialState, start, pause, reset, advance, setPreset, setLinkedTask, readyToFocus,
    remainingMs, hasElapsed, isRunning, isIdle, phaseLabel, phaseDurationMs, PRESETS,
} from '../utils/pomodoro'
import { getTodayStr } from '../utils/date'
import { recordFocus } from '../utils/focusLog'
import { showToast } from '../utils/toast'
import { isSoundOn, playChime } from '../utils/chime'

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
    /** 換綁的待辦（null＝解除），不影響計時 */
    onLinkTask: (task: LinkedTask | null) => void
    /** 綁好並準備專注（任務中心的「專注」）：停在休息時切回專注 */
    onFocusTask: (task: LinkedTask) => void
}

/** 蓋住視窗時 tick 會被節流，所以只拿它重畫；1 秒是顯示需求不是計時需求。 */
const TICK_MS = 1000
/** 「復原」提示停留多久 */
export const UNDO_MS = 6000

export interface UsePomodoroOptions {
    /** 白板載入完成了沒；沒完成前不結算到點的專注（綁的待辦還找不到） */
    ready: boolean
    /** 綁了待辦的 focus 跑完時呼叫；回傳是否真的記到（待辦被刪、白板進垃圾桶就是 false） */
    onFocusComplete?: (task: LinkedTask) => boolean
}

export function usePomodoro(opts: UsePomodoroOptions = { ready: true }): UsePomodoro {
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
    // 用 ref 拿最新的 callback：它依賴 boards，放進 effect 的 deps 會讓計時檢查每次存檔都重掛。
    const onFocusCompleteRef = useRef(opts.onFocusComplete)
    onFocusCompleteRef.current = opts.onFocusComplete
    useEffect(() => {
        if (!isRunning(state)) return
        // 白板還沒載入完就先不結算：關著 App 時跑完的那段，重開時要等 boards 到了才記得進待辦。
        if (!opts.ready) return
        const endsAt = state.endsAt!
        const check = () => {
            if (!hasElapsed(state, Date.now())) return
            if (firedRef.current === endsAt) return
            firedRef.current = endsAt

            const finished = state.phase
            const next = advance(state, getTodayStr(), true)
            setState(next)
            // 週回顧的「本週專注」（P2-5）：不管有沒有綁待辦都算
            if (finished === 'focus') recordFocus(getTodayStr(), phaseDurationMs(state) / 60000)

            // 只有跑完的 focus 才記到綁的待辦；跳過走 onSkip，不會經過這裡。
            const task = finished === 'focus' ? state.linkedTask : null
            const credited = task ? onFocusCompleteRef.current?.(task) ?? false : false

            const msg = finished === 'focus'
                ? `專注結束，第 ${next.completedFocus} 個番茄完成${task ? (credited ? `（記到「${task.text}」）` : '（綁的待辦找不到了，沒記到）') : ''} → 接著${phaseLabel(next.phase)}`
                : `${phaseLabel(finished)}結束 → 回到專注`
            showToast(msg, 'success', {
                durationMs: null,   // 人多半不在螢幕前，不能自己消失
                action: { label: `開始${phaseLabel(next.phase)}`, run: () => setState(s => start(s, Date.now())) },
            })
            if (isSoundOn()) playChime()
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
    }, [state, opts.ready])

    // 第一次用到時要一次權限；不阻塞、被拒也不影響功能。
    useEffect(() => {
        try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
                void Notification.requestPermission()
            }
        } catch { /* 不支援 */ }
    }, [])

    // 會丟掉進度的三個操作（跳過／重設／換長度）：照樣立刻做，但已經跑了一段的話給 6 秒「復原」。
    // 不用確認框：跳過休息是常用操作，每次都問很煩；按錯了能救回來就夠。
    // 用 ref 取當下狀態，不在 setState 的 updater 裡跳 toast（StrictMode 會呼叫兩次）。
    const stateRef = useRef(state)
    stateRef.current = state
    const undoable = useCallback((fn: (s: PomodoroState) => PomodoroState, message: (prev: PomodoroState) => string) => {
        const prev = stateRef.current
        const next = fn(prev)
        if (next === prev) return
        stateRef.current = next
        setState(next)
        if (isIdle(prev)) return   // 還沒開始：沒有東西會丟
        // 還原成按之前的樣子。在跑的話 endsAt 是絕對時刻，中間這幾秒照算，等於沒按過。
        showToast(message(prev), 'info', { durationMs: UNDO_MS, action: { label: '復原', run: () => setState(prev) } })
    }, [])

    const onStart = useCallback(() => setState(s => start(s, Date.now())), [])
    const onPause = useCallback(() => setState(s => pause(s, Date.now())), [])
    const onReset = useCallback(() => undoable(reset, p => `已重設${phaseLabel(p.phase)}`), [undoable])
    const onSkip = useCallback(() => undoable(s => advance(s, getTodayStr(), false), p => `已跳過${phaseLabel(p.phase)}`), [undoable])
    const onSetPreset = useCallback((presetId: string) => undoable(
        s => setPreset(s, presetId),
        () => `已換成 ${PRESETS.find(p => p.id === presetId)?.label ?? presetId}，這一段重新計時`,
    ), [undoable])
    const onLinkTask = useCallback((task: LinkedTask | null) => setState(s => setLinkedTask(s, task)), [])
    const onFocusTask = useCallback((task: LinkedTask) => setState(s => readyToFocus(setLinkedTask(s, task))), [])

    const now = Date.now()
    const remaining = remainingMs(state, now)

    return useMemo(() => ({
        state,
        remaining,
        running: isRunning(state),
        idle: isIdle(state),
        totalMs: phaseDurationMs(state),
        onStart, onPause, onReset, onSkip, onSetPreset, onLinkTask, onFocusTask,
    }), [state, remaining, onStart, onPause, onReset, onSkip, onSetPreset, onLinkTask, onFocusTask])
}
