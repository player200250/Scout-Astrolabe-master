// src/utils/pomodoro.ts — 番茄鐘的純邏輯（無 React、無計時器、無 DOM）
//
// ⚠️⚠️ **這裡刻意沒有「每秒減一」這種寫法。**
// 視窗被別的程式蓋住時 visibilityState 會變 hidden，Chromium 會把 setInterval／setTimeout
// 節流（實測 3500ms 的計時器被拖到 4371ms）。若用「每 tick 扣 1 秒」累加誤差，
// 專注 25 分鐘可能實際跑了 30 分鐘，而使用者正是在「切去畫圖、把 App 蓋住」的時候用它。
//
// 所以狀態只存**絕對結束時刻 `endsAt`**，剩餘時間一律由 `Date.now()` 當場算。
// 計時器只負責「叫 UI 重畫」，被節流最多是秒數跳動不流暢，**不會影響正確性**。

export type PomodoroPhase = 'focus' | 'shortBreak' | 'longBreak'

/** 一組時長設定（毫秒）。預設兩個 preset，見 PRESETS。 */
export interface PomodoroDurations {
    focus: number
    shortBreak: number
    longBreak: number
}

export interface PomodoroPreset {
    id: string
    label: string
    durations: PomodoroDurations
}

const MIN = 60_000

export const PRESETS: PomodoroPreset[] = [
    // 經典番茄。
    { id: 'classic', label: '25 / 5', durations: { focus: 25 * MIN, shortBreak: 5 * MIN, longBreak: 15 * MIN } },
    // 畫圖／綁骨這種「進入狀態要花時間」的工作，25 分鐘常常剛熱身就被打斷。
    { id: 'deep', label: '50 / 10', durations: { focus: 50 * MIN, shortBreak: 10 * MIN, longBreak: 30 * MIN } },
]

export const DEFAULT_PRESET_ID = 'classic'

/** 每完成幾個專注後給一次長休息。 */
export const LONG_BREAK_EVERY = 4

/**
 * 完整狀態。**同時只有一種計時方式有效**：
 * - 進行中 → `endsAt` 有值、`pausedRemainingMs` 為 null
 * - 暫停中 → 反過來
 * 兩個都存是為了「暫停後關掉 App、隔天打開還在同一個地方」。
 */
export interface PomodoroState {
    phase: PomodoroPhase
    presetId: string
    /** 進行中：絕對結束時刻（epoch ms）。暫停或閒置時為 null。 */
    endsAt: number | null
    /** 暫停中：剩餘毫秒。進行中為 null。 */
    pausedRemainingMs: number | null
    /** 今天累計完成的專注段數（只有 focus 跑完才 +1，中途放棄不算）。 */
    completedFocus: number
    /** completedFocus 是哪一天的，跨日自動歸零。 */
    countedOn: string
    /** 這段專注綁的待辦（null＝沒綁）。focus 跑完時該待辦的 focusCount +1。 */
    linkedTask: LinkedTask | null
}

/**
 * 番茄鐘綁定的待辦。用 id 定位（同 snapshotPatch.toggleTodo 的理由）；
 * text 只是顯示用的快照——原卡改了字、或待辦被刪掉，面板上還認得出綁的是哪一項。
 */
export interface LinkedTask {
    boardId: string
    shapeId: string
    todoId: string
    text: string
}

export function durationsOf(presetId: string): PomodoroDurations {
    return (PRESETS.find(p => p.id === presetId) ?? PRESETS[0]).durations
}

export function phaseLabel(phase: PomodoroPhase): string {
    return phase === 'focus' ? '專注' : phase === 'shortBreak' ? '短休息' : '長休息'
}

export function initialState(todayStr: string, presetId = DEFAULT_PRESET_ID): PomodoroState {
    return {
        phase: 'focus',
        presetId,
        endsAt: null,
        pausedRemainingMs: null,
        completedFocus: 0,
        countedOn: todayStr,
        linkedTask: null,
    }
}

/** 這個階段的完整長度。 */
export function phaseDurationMs(state: PomodoroState): number {
    return durationsOf(state.presetId)[state.phase]
}

export function isRunning(state: PomodoroState): boolean {
    return state.endsAt !== null
}

/** 尚未開始（既沒在跑也沒暫停）＝停在這個階段的起點。 */
export function isIdle(state: PomodoroState): boolean {
    return state.endsAt === null && state.pausedRemainingMs === null
}

/**
 * 剩餘毫秒。**唯一的時間來源是傳進來的 now**，方便測試也避免各處各自呼叫 Date.now()
 * 而拿到不同的值。跑完會停在 0，不會變負數。
 */
export function remainingMs(state: PomodoroState, now: number): number {
    if (state.endsAt !== null) return Math.max(0, state.endsAt - now)
    if (state.pausedRemainingMs !== null) return state.pausedRemainingMs
    return phaseDurationMs(state)
}

/** 進行中且已經到點。UI 靠這個決定要不要跳「這一段結束了」。 */
export function hasElapsed(state: PomodoroState, now: number): boolean {
    return state.endsAt !== null && now >= state.endsAt
}

/** mm:ss。超過一小時會顯示 h:mm:ss（長休息 30 分鐘用不到，但設定可能被改）。 */
export function formatRemaining(ms: number): string {
    const total = Math.ceil(Math.max(0, ms) / 1000)
    const s = total % 60
    const m = Math.floor(total / 60) % 60
    const h = Math.floor(total / 3600)
    const mm = String(m).padStart(2, '0')
    const ss = String(s).padStart(2, '0')
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** 0–1，給進度環用。 */
export function progress(state: PomodoroState, now: number): number {
    const total = phaseDurationMs(state)
    if (total <= 0) return 0
    return Math.min(1, Math.max(0, 1 - remainingMs(state, now) / total))
}

// ---- transitions（全部回傳新物件，不就地改） ----

export function start(state: PomodoroState, now: number): PomodoroState {
    if (isRunning(state)) return state
    const remaining = state.pausedRemainingMs ?? phaseDurationMs(state)
    return { ...state, endsAt: now + remaining, pausedRemainingMs: null }
}

export function pause(state: PomodoroState, now: number): PomodoroState {
    if (!isRunning(state)) return state
    return { ...state, endsAt: null, pausedRemainingMs: remainingMs(state, now) }
}

/** 回到這一段的起點（不動已完成的段數）。 */
export function reset(state: PomodoroState): PomodoroState {
    return { ...state, endsAt: null, pausedRemainingMs: null }
}

/**
 * 決定 focus 之後要接哪一種休息。
 * ⚠️ 用「完成後的段數」判斷：完成第 4 段時 completed=4 ⇒ 長休息。
 */
export function nextPhaseAfterFocus(completedFocus: number): PomodoroPhase {
    return completedFocus > 0 && completedFocus % LONG_BREAK_EVERY === 0 ? 'longBreak' : 'shortBreak'
}

/**
 * 進到下一個階段。`countedCompletion` 為 true 表示這是「跑完」而不是「按跳過」——
 * ⚠️ 只有跑完的 focus 才計入 completedFocus，否則按幾下跳過就能刷出一堆假的番茄數。
 */
export function advance(state: PomodoroState, todayStr: string, countedCompletion: boolean): PomodoroState {
    const sameDay = state.countedOn === todayStr
    const base = sameDay ? state.completedFocus : 0

    if (state.phase === 'focus') {
        const completedFocus = countedCompletion ? base + 1 : base
        return {
            ...state,
            phase: nextPhaseAfterFocus(completedFocus),
            endsAt: null,
            pausedRemainingMs: null,
            completedFocus,
            countedOn: todayStr,
        }
    }
    // 休息結束 → 回到專注
    return { ...state, phase: 'focus', endsAt: null, pausedRemainingMs: null, completedFocus: base, countedOn: todayStr }
}

export function setPreset(state: PomodoroState, presetId: string): PomodoroState {
    if (presetId === state.presetId) return state
    // 換 preset 等於重設當前這一段：跑到一半改長度，剩餘時間該算誰的沒有正確答案，
    // 停下來讓使用者自己按開始最不會誤解。
    return { ...state, presetId, endsAt: null, pausedRemainingMs: null }
}

/**
 * 換綁的待辦（null＝解除）。**不動計時**：跑到一半發現綁錯了，改過來就好，
 * 不該連已經專注的時間一起丟掉；跑完時記到當下綁的那一項。
 */
export function setLinkedTask(state: PomodoroState, task: LinkedTask | null): PomodoroState {
    return { ...state, linkedTask: task }
}

/**
 * 從任務中心按「專注」：綁好之後要能直接按開始就專注。
 * 停在休息階段（沒在跑）時切回專注——不然按開始跑的是休息（v1.8.0 驗收時桌面版 Claude 抓到）。
 * 休息**正在跑**就不動：那是使用者自己按的，不該被另一顆按鈕打斷。
 */
export function readyToFocus(state: PomodoroState): PomodoroState {
    if (state.phase === 'focus' || !isIdle(state)) return state
    return { ...state, phase: 'focus', endsAt: null, pausedRemainingMs: null }
}

function parseLinkedTask(v: unknown): LinkedTask | null {
    if (!v || typeof v !== 'object') return null
    const o = v as Record<string, unknown>
    const ok = (k: string) => typeof o[k] === 'string' && (o[k] as string).length > 0
    if (!ok('boardId') || !ok('shapeId') || !ok('todoId')) return null
    return {
        boardId: o.boardId as string,
        shapeId: o.shapeId as string,
        todoId: o.todoId as string,
        text: typeof o.text === 'string' ? o.text : '',
    }
}

// ---- 持久化 ----

export const POMODORO_STORAGE_KEY = 'pomodoro-state'

/**
 * 從 localStorage 讀回來。**任何欄位不合法就整包丟掉回初始值**——
 * 這是使用者的計時器不是資料，壞掉重來的代價遠低於帶著半殘狀態跑。
 */
export function parseStored(raw: string | null, todayStr: string): PomodoroState {
    if (!raw) return initialState(todayStr)
    try {
        const o = JSON.parse(raw) as Partial<PomodoroState>
        const phase = o.phase
        if (phase !== 'focus' && phase !== 'shortBreak' && phase !== 'longBreak') return initialState(todayStr)
        const presetId = typeof o.presetId === 'string' && PRESETS.some(p => p.id === o.presetId)
            ? o.presetId : DEFAULT_PRESET_ID
        const endsAt = typeof o.endsAt === 'number' && Number.isFinite(o.endsAt) ? o.endsAt : null
        const pausedRemainingMs = typeof o.pausedRemainingMs === 'number' && o.pausedRemainingMs >= 0
            ? o.pausedRemainingMs : null
        const countedOn = typeof o.countedOn === 'string' ? o.countedOn : todayStr
        const rawCount = typeof o.completedFocus === 'number' && o.completedFocus >= 0 ? o.completedFocus : 0
        return {
            phase,
            presetId,
            // 兩者不可同時有值；以「進行中」為準。
            endsAt,
            pausedRemainingMs: endsAt !== null ? null : pausedRemainingMs,
            // 跨日歸零：昨天的番茄數不該算進今天。
            completedFocus: countedOn === todayStr ? rawCount : 0,
            countedOn: todayStr,
            // 舊版存的沒有這欄＝沒綁；綁定壞掉也只是解除綁定，不整包丟掉。
            linkedTask: parseLinkedTask((o as Record<string, unknown>).linkedTask),
        }
    } catch {
        return initialState(todayStr)
    }
}
