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
    /**
     * boardId → 最後一次推上雲的**縮圖**指紋。
     * 縮圖是整列裡最大的一塊（實測 8KB 內容配 57KB 縮圖），但它很少變；
     * 有了指紋就能在推送時省略沒變的縮圖欄位，改一個字不必重傳 57KB。
     */
    thumbHash: Record<string, string>
    /**
     * 已經上傳到 Supabase Storage 的圖片 storedName。
     *
     * 用陣列不用物件：這裡只需要「有沒有在裡面」，沒有要記時間戳。
     * 可以只記一次就永遠有效，是因為 **storedName 是 uuid 且圖片內容不可變**——
     * 換一張圖就是換一個 storedName，不會出現「同名但內容變了」。
     */
    uploadedImages: string[]
    /** 最後一次成功跑完拉取檢查的時間；純供 UI 顯示「上次同步」*/
    lastPulledAt: number | null
}

export const EMPTY_SYNC_STATE: SyncState = {
    userId: null, pushed: {}, thumbHash: {}, uploadedImages: [], lastPulledAt: null,
}

/**
 * 縮圖指紋（djb2 + 長度）。只用來回答「跟上次推的那張一不一樣」，
 * 不是安全雜湊——這裡不需要抗碰撞，選它是因為夠快又不必引依賴。
 */
export function hashThumbnail(thumbnail: string | null | undefined): string {
    if (!thumbnail) return ''
    let h = 5381
    for (let i = 0; i < thumbnail.length; i++) {
        h = ((h * 33) ^ thumbnail.charCodeAt(i)) >>> 0
    }
    return `${thumbnail.length}:${h.toString(36)}`
}

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

/** 記下「這塊板的縮圖已經是這個版本了」*/
export function markThumbPushed(state: SyncState, boardId: string, hash: string): SyncState {
    if (state.thumbHash[boardId] === hash) return state
    return { ...state, thumbHash: { ...state.thumbHash, [boardId]: hash } }
}

/** 這塊板的縮圖跟上次推的是不是同一張 */
export function isThumbnailUnchanged(
    state: SyncState,
    boardId: string,
    thumbnail: string | null | undefined,
): boolean {
    const known = state.thumbHash[boardId]
    return known !== undefined && known === hashThumbnail(thumbnail)
}

// ── 圖片上傳記錄 ──────────────────────────────────────────────────────────

/** 這張圖上傳過了嗎 */
export function isImageUploaded(state: SyncState, storedName: string): boolean {
    return state.uploadedImages.includes(storedName)
}

/** 記下「這些圖已經在雲端了」（去重；沒有新東西時回原物件，避免無謂的重存） */
export function markImagesUploaded(state: SyncState, storedNames: string[]): SyncState {
    const known = new Set(state.uploadedImages)
    const added = storedNames.filter(n => !known.has(n))
    if (added.length === 0) return state
    return { ...state, uploadedImages: [...state.uploadedImages, ...added] }
}

/**
 * 清掉「本機已經沒有任何卡片引用到」的圖片記錄。
 *
 * ⚠️ 這只是**修剪本機記錄**，不會去刪雲端的物件——那是孤兒物件 GC 的範疇，
 * 與墓碑列的 GC 一起做（見 roadmap-mobile「尚未做」）。記錄清掉的效果是：
 * 萬一同一個 storedName 日後又被引用（從備份還原），會重新上傳一次。
 */
export function pruneUploadedImages(state: SyncState, referenced: Iterable<string>): SyncState {
    const keep = new Set(referenced)
    const next = state.uploadedImages.filter(n => keep.has(n))
    return next.length === state.uploadedImages.length ? state : { ...state, uploadedImages: next }
}

/** 忘掉某塊板（永久刪除後用，避免記錄無限長大）*/
export function forgetBoard(state: SyncState, boardId: string): SyncState {
    if (!(boardId in state.pushed) && !(boardId in state.thumbHash)) return state
    const pushed = { ...state.pushed }
    const thumbHash = { ...state.thumbHash }
    delete pushed[boardId]
    delete thumbHash[boardId]
    return { ...state, pushed, thumbHash }
}

/** 清掉本機已不存在的板的記錄（每次全量同步後呼叫一次即可）*/
export function pruneState(state: SyncState, existingIds: Iterable<string>): SyncState {
    const keep = new Set(existingIds)
    const pushed: Record<string, number> = {}
    for (const [id, at] of Object.entries(state.pushed)) {
        if (keep.has(id)) pushed[id] = at
    }
    const thumbHash: Record<string, string> = {}
    for (const [id, h] of Object.entries(state.thumbHash)) {
        if (keep.has(id)) thumbHash[id] = h
    }
    const unchanged = Object.keys(pushed).length === Object.keys(state.pushed).length
        && Object.keys(thumbHash).length === Object.keys(state.thumbHash).length
    return unchanged ? state : { ...state, pushed, thumbHash }
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
            // 舊記錄沒有這個欄位＝當成「不知道雲端的縮圖長怎樣」，下次推送會補送一次
            thumbHash: parsed.thumbHash && typeof parsed.thumbHash === 'object' ? parsed.thumbHash : {},
            // 同上：舊記錄沒有這欄＝當成一張都沒上傳過，下一輪會把現有的圖補上去
            uploadedImages: Array.isArray(parsed.uploadedImages) ? parsed.uploadedImages : [],
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
