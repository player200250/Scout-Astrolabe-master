// src/sync/syncState.ts
// 「哪些板還沒推上雲」的記錄（S0(b) 自動同步）。
//
// 為什麼需要這一層：自動推送必須知道**哪塊板變髒了**。最直覺的做法是在記憶體裡放一個
// dirty Set，但那樣一關 App 就忘了——離線時改的東西會永遠留在本機。
// 改成記錄「每塊板最後一次**成功推上雲**的 updatedAt」，dirty 判斷就變成純比大小：
//
//     board.updatedAt > pushed[board.id]  ⇒ 這塊板有還沒推的變更
//
// 這個定義跨重啟、跨離線都成立，而且不必新增 Dexie 表（沿用 syncConfig 的 localStorage 慣例）。
//
// ⚠️ 記錄綁 userId：換帳號登入時舊記錄一律作廢，否則新帳號的雲端是空的、
// 本機卻以為「都推過了」，結果什麼都不會上傳。

const STORAGE_KEY = 'astrolabe-sync-state'

export interface SyncState {
    /** 這份記錄屬於哪個 Supabase 使用者；與目前登入者不符時整份作廢 */
    userId: string | null
    /** boardId → 最後一次成功推上雲的那筆 updatedAt（epoch 毫秒）*/
    pushed: Record<string, number>
    /** 最後一次成功跑完拉取檢查的時間；純供 UI 顯示「上次同步」*/
    lastPulledAt: number | null
}

export const EMPTY_SYNC_STATE: SyncState = { userId: null, pushed: {}, lastPulledAt: null }

// ── 純函式（可單元測試的部分）──────────────────────────────────────────────

/** 這塊板有沒有還沒推上雲的變更 */
export function isDirty(
    board: { id: string; updatedAt: number },
    state: SyncState,
): boolean {
    const pushed = state.pushed[board.id]
    return pushed === undefined || board.updatedAt > pushed
}

/** 挑出所有還沒推的板（全量推送用）*/
export function selectDirtyBoards<T extends { id: string; updatedAt: number }>(
    boards: T[],
    state: SyncState,
): T[] {
    return boards.filter(b => isDirty(b, state))
}

/** 記下「這塊板的這個版本已經推上去了」（回新物件，不改原本的）*/
export function markPushed(state: SyncState, boardId: string, updatedAt: number): SyncState {
    return { ...state, pushed: { ...state.pushed, [boardId]: updatedAt } }
}

/**
 * 從雲端拉回一塊板之後也要記一筆——本機這下與雲端同版本，
 * 不記的話下一輪會把剛拉回來的東西原封不動再推一次（無害但浪費）。
 */
export const markPulled = markPushed

/** 忘掉某塊板（永久刪除後用，避免記錄無限長大）*/
export function forgetBoard(state: SyncState, boardId: string): SyncState {
    if (!(boardId in state.pushed)) return state
    const pushed = { ...state.pushed }
    delete pushed[boardId]
    return { ...state, pushed }
}

/** 清掉本機已不存在的板的記錄（每次全量同步後呼叫一次即可）*/
export function pruneState(state: SyncState, existingIds: Iterable<string>): SyncState {
    const keep = new Set(existingIds)
    const pushed: Record<string, number> = {}
    for (const [id, at] of Object.entries(state.pushed)) {
        if (keep.has(id)) pushed[id] = at
    }
    return Object.keys(pushed).length === Object.keys(state.pushed).length
        ? state
        : { ...state, pushed }
}

// ── 持久化 ────────────────────────────────────────────────────────────────

/**
 * 讀出記錄。傳入目前登入者的 userId：與記錄裡的不符（換帳號、或記錄是舊格式）
 * 就回空的，讓所有板重新被視為 dirty＝整份重推一次。
 */
export function loadSyncState(userId: string | null): SyncState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return { ...EMPTY_SYNC_STATE, userId }
        const parsed = JSON.parse(raw) as Partial<SyncState>
        if (!parsed || parsed.userId !== userId) return { ...EMPTY_SYNC_STATE, userId }
        return {
            userId,
            pushed: parsed.pushed && typeof parsed.pushed === 'object' ? parsed.pushed : {},
            lastPulledAt: typeof parsed.lastPulledAt === 'number' ? parsed.lastPulledAt : null,
        }
    } catch {
        return { ...EMPTY_SYNC_STATE, userId }
    }
}

export function saveSyncState(state: SyncState): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch { /* localStorage 滿了/被禁用：同步記錄存不了也不該讓 App 掛掉 */ }
}

export function clearSyncState(): void {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* 同上 */ }
}
