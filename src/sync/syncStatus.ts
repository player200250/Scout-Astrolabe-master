// src/sync/syncStatus.ts
// 同步狀態的型別與顯示文字（純資料，無副作用）。
//
// 刻意獨立成一個小檔：`utils/appEvents.ts` 要用這個型別來定義 'sync-status-changed' 的
// payload，若直接從 syncEngine 匯入就會形成 appEvents ↔ syncEngine 的循環相依。

export type SyncPhase =
    | 'disabled'  // 沒設定或沒登入——完全不碰任何 Supabase 程式碼路徑
    | 'paused'    // 設定好了但使用者把自動同步關掉
    | 'idle'      // 一切同步完畢
    | 'syncing'   // 正在推 / 拉
    | 'pending'   // 有東西還沒推上去（多半是離線，等下次重試）
    | 'error'     // 上一輪失敗

export interface SyncStatus {
    phase: SyncPhase
    /** 還沒成功推上雲的白板數 */
    pendingCount: number
    /** 上一次完整跑完同步的時間（epoch 毫秒）*/
    lastSyncedAt: number | null
    /** 上一次的錯誤訊息（已是中文）*/
    lastError: string | null
}

export const INITIAL_SYNC_STATUS: SyncStatus = {
    phase: 'disabled',
    pendingCount: 0,
    lastSyncedAt: null,
    lastError: null,
}

/** 狀態列要顯示的一行字（純函式，好測）*/
export function describeSyncStatus(status: SyncStatus, now: number = Date.now()): string {
    switch (status.phase) {
        case 'disabled': return '未啟用'
        case 'paused':   return '自動同步已關閉'
        case 'syncing':  return '同步中…'
        case 'pending':  return `${status.pendingCount} 塊待上傳`
        case 'error':    return `同步失敗：${status.lastError ?? '未知錯誤'}`
        case 'idle':     return status.lastSyncedAt
            ? `已同步 · ${formatAgo(now - status.lastSyncedAt)}`
            : '已同步'
    }
}

/** 「幾秒前 / 幾分鐘前」——同步狀態列用，不值得為此加 date-fns 依賴 */
export function formatAgo(elapsedMs: number): string {
    if (elapsedMs < 0) return '剛剛'
    const sec = Math.floor(elapsedMs / 1000)
    if (sec < 60) return '剛剛'
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min} 分鐘前`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr} 小時前`
    return `${Math.floor(hr / 24)} 天前`
}

/** 狀態要不要顯眼一點（有事情要使用者知道）*/
export function isSyncAttention(status: SyncStatus): boolean {
    return status.phase === 'error' || (status.phase === 'pending' && status.pendingCount > 0)
}
