// src/sync/syncEngine.ts
// 自動同步引擎（S0(b) 後續五項：存檔後推送／輪詢拉取／全量同步／活躍板提示／軟刪除雙向）。
//
// 定位：**探路段那套手動推拉之上的自動排程層**。所有實際的網路動作仍然只走 boardSync.ts，
// 這裡負責的是「什麼時候該推什麼、拉回來的東西怎麼套用才不會毀掉使用者正在做的事」。
//
// ── 幾個貫穿全檔的規則（改動前請先讀）──────────────────────────────────────
//
// 1. **本機存檔永遠優先，同步失敗絕不能影響它。**
//    notifyBoardSaved() 由 utils/boardDb.ts 的 saveBoard 呼叫，是 fire-and-forget：
//    整個引擎任何一步丟例外，Dexie 那筆寫入都已經完成了。
//
// 2. **套用雲端資料一律直接寫 db，不走 saveBoard。**
//    saveBoard 會回頭呼叫 notifyBoardSaved → 把剛拉回來的東西再推一次 → 無窮迴圈。
//    這個檔案裡所有的寫入都是 `db.table('boards').put(...)`，這不是隨手寫的，別「順手統一」。
//
// 3. **updatedAt 是唯一的尺。** 軟刪除／還原也必須推進 updatedAt，否則刪除事件會輸給
//    另一端較新的普通編輯，板子就會復活（見 useTrash.ts 對應的註解）。
//
// 4. **正在開著的那塊板不會被靜默覆蓋**（第 4 項需求）。遠端較新時只發提示事件，
//    使用者按下「立即載入」才真的套用。
import { db, type BoardRecord } from '../db'
import { getCurrentUserId } from './supabaseClient'
import { isSyncConfigured, isAutoSyncEnabled } from './syncConfig'
import { pushBoard, pullBoard, listRemoteBoards, decideSync } from './boardSync'
import {
    loadSyncState, saveSyncState, markPushed, markPulled, markThumbPushed,
    hashThumbnail, isThumbnailUnchanged, selectDirtyBoards, pruneState, type SyncState,
} from './syncState'
import { INITIAL_SYNC_STATUS, type SyncStatus } from './syncStatus'
import { emitAppEvent } from '../utils/appEvents'

// ── 節奏參數 ─────────────────────────────────────────────────────────────────
// 存檔到推送之間的等待。tldraw 存檔很密集（拖一張卡就好幾次），不去抖的話
// 會把每一格中間狀態都送上雲。4 秒是「停下來想一下」的長度。
const PUSH_DEBOUNCE_MS = 4000
// 輪詢間隔。手機速記到桌機看到的延遲上限；太短會一直打 API、太長會覺得沒同步。
const POLL_INTERVAL_MS = 60000
// 失敗後的重試間隔（離線最常見）。指數退避，上限 5 分鐘。
const RETRY_BACKOFF_MS = [5000, 15000, 60000, 300000]

// ── 模組狀態 ─────────────────────────────────────────────────────────────────
let started = false
let activeBoardId: string | null = null
let running = false
let rerunRequested = false
let pushTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let failureCount = 0
let status: SyncStatus = INITIAL_SYNC_STATUS

/** 已經提示過的「活躍板遠端較新」，避免每輪輪詢都彈同一則提示 */
const notifiedConflicts = new Set<string>()

// ── 狀態廣播 ─────────────────────────────────────────────────────────────────

export function getSyncStatus(): SyncStatus {
    return status
}

function setStatus(patch: Partial<SyncStatus>): void {
    const next = { ...status, ...patch }
    if (
        next.phase === status.phase &&
        next.pendingCount === status.pendingCount &&
        next.lastSyncedAt === status.lastSyncedAt &&
        next.lastError === status.lastError
    ) return
    status = next
    emitAppEvent('sync-status-changed', status)
}

// ── 對外：由 App / boardDb 呼叫的入口 ────────────────────────────────────────

/**
 * 啟動引擎（App 掛載時呼叫一次）。沒設定或沒開自動同步時只是把狀態設成 disabled/paused，
 * 不會有任何網路行為——「沒設定雲端同步的使用者完全碰不到 Supabase 程式碼」是 ADR 0006 的前提。
 */
export function startSyncEngine(): void {
    if (started) return
    started = true

    if (!isSyncConfigured()) { setStatus({ phase: 'disabled' }); return }
    if (!isAutoSyncEnabled()) { setStatus({ phase: 'paused' }); return }

    // 視窗回到前景時立刻補一次：輪詢在視窗被遮蔽時會被 Chromium 節流，
    // 回來時可能已經隔了很久（節流實測見專案記憶「遮蔽視窗會節流計時器」）。
    window.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    pollTimer = setInterval(() => { void runSync('poll') }, POLL_INTERVAL_MS)
    void runSync('startup')
}

export function stopSyncEngine(): void {
    if (!started) return
    started = false
    window.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('online', handleOnline)
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
}

/** 設定或登入狀態改變後重新套用（面板存檔／登入／登出時呼叫）*/
export function restartSyncEngine(): void {
    stopSyncEngine()
    notifiedConflicts.clear()
    setStatus({ ...INITIAL_SYNC_STATUS })
    startSyncEngine()
}

/**
 * 告訴引擎現在畫布開著哪塊板。這塊板不會被自動覆蓋（第 4 項需求）。
 * 切板時順便跑一次同步——剛離開的那塊板正好可以推上去，要進的那塊板也該拿最新的。
 */
export function setActiveBoardForSync(boardId: string | null): void {
    if (activeBoardId === boardId) return
    activeBoardId = boardId
    if (started) scheduleSync()
}

/**
 * 白板存檔了（由 utils/boardDb.ts 的 saveBoard 呼叫）。
 * ⚠️ 一定要 fire-and-forget：這裡丟例外不能影響到本機那筆已完成的寫入。
 */
export function notifyBoardSaved(board: BoardRecord): void {
    if (!started) return
    setStatus({ phase: status.phase === 'syncing' ? 'syncing' : 'pending' })
    scheduleSync()
    void board // 內容不需要帶進來——dirty 判斷一律以 DB 為準（見 runSync）
}

/**
 * 白板被永久刪除了（垃圾桶清空、過期自動清理）。
 * 推一列**墓碑**（保留 id 與 deleted_at、清掉 snapshot/thumbnail）而不是把雲端那列刪掉：
 * 直接刪列的話，另一端還留著這塊板，下次它一同步就會以「僅本機」的身分把它整個推回來＝復活。
 */
export function notifyBoardDeleted(board: BoardRecord): void {
    if (!started) return
    void pushTombstone(board).catch(err => console.error('[sync] 推送墓碑失敗', err))
}

/** 手動觸發一次完整同步（雲端同步面板的「立即同步」）*/
export async function syncNow(): Promise<SyncStatus> {
    await runSync('manual')
    return status
}

// ── 排程 ─────────────────────────────────────────────────────────────────────

function scheduleSync(delay: number = PUSH_DEBOUNCE_MS): void {
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(() => { pushTimer = null; void runSync('debounced') }, delay)
}

function handleVisibilityChange(): void {
    if (document.visibilityState === 'visible') scheduleSync(500)
}

function handleOnline(): void {
    failureCount = 0
    scheduleSync(500)
}

function scheduleRetry(): void {
    const delay = RETRY_BACKOFF_MS[Math.min(failureCount - 1, RETRY_BACKOFF_MS.length - 1)]
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = setTimeout(() => { retryTimer = null; void runSync('retry') }, delay)
}

// ── 主流程 ───────────────────────────────────────────────────────────────────

/**
 * 一輪同步：先把本機的變更推上去，再把雲端較新的拉回來。
 *
 * 順序是刻意的——先推再拉，本機剛做的修改才會在同一輪內成為「雲端最新」，
 * 不會被上一輪的舊遠端資料倒著蓋回來。
 */
async function runSync(reason: string): Promise<void> {
    // 同一時間只跑一輪。跑的當中又被要求同步就記下來，跑完再補一次。
    if (running) { rerunRequested = true; return }

    if (!isSyncConfigured()) { setStatus({ phase: 'disabled' }); return }
    if (!isAutoSyncEnabled() && reason !== 'manual') { setStatus({ phase: 'paused' }); return }

    const userId = await getCurrentUserId()
    // 設定填好了卻拿不到身分＝沒登入或 token 刷新失敗。與 'disabled' 分開回報，
    // 否則同步靜靜停掉時，面板看起來會像使用者根本沒設定過這個功能。
    if (!userId) { setStatus({ phase: 'signed-out' }); return }

    running = true
    setStatus({ phase: 'syncing' })

    try {
        let state = loadSyncState(userId)
        const localBoards: BoardRecord[] = await db.table('boards').toArray()

        const push = await pushPhase(localBoards, state)
        state = push.state

        // 推送有失敗也照樣拉取：拉是唯讀的，不該被「某塊板推不上去」連累。
        // 真的是離線的話這裡也會失敗，由下面的 pullError 一起回報。
        let applied: BoardRecord[] = []
        let pullError: string | null = null
        try {
            const pull = await pullPhase(localBoards, state)
            applied = pull.applied
            state = pull.state
        } catch (e) {
            pullError = e instanceof Error ? e.message : String(e)
        }

        const knownIds = new Set([...localBoards.map(b => b.id), ...applied.map(b => b.id)])
        state = { ...pruneState(state, knownIds), lastPulledAt: Date.now() }
        saveSyncState(state)

        if (applied.length > 0) {
            emitAppEvent('sync-boards-updated', { boards: applied })
        }

        const stillPending = selectDirtyBoards(localBoards, state).length

        if (push.failures.length > 0 || pullError) {
            failureCount++
            const message = describeFailures(push.failures, pullError)
            console.warn(`[sync] 第 ${failureCount} 次未完全成功（${reason}）：${message}`)
            // lastSyncedAt 刻意不更新——沒有全部成功就不該顯示「已同步 · 剛剛」
            setStatus({ phase: 'error', pendingCount: stillPending, lastError: message })
            scheduleRetry()
            return
        }

        failureCount = 0
        setStatus({
            phase: stillPending > 0 ? 'pending' : 'idle',
            pendingCount: stillPending,
            lastSyncedAt: Date.now(),
            lastError: null,
        })
    } catch (e) {
        failureCount++
        const message = e instanceof Error ? e.message : String(e)
        console.warn(`[sync] 第 ${failureCount} 次失敗（${reason}）：${message}`)
        setStatus({ phase: 'error', lastError: message })
        scheduleRetry()
    } finally {
        running = false
        if (rerunRequested) { rerunRequested = false; scheduleSync(1000) }
    }
}

export interface PushFailure {
    id: string
    name: string
    error: string
}

/** 把所有還沒推上雲的板推上去 */
async function pushPhase(
    localBoards: BoardRecord[],
    state: SyncState,
): Promise<{ state: SyncState; failures: PushFailure[] }> {
    const dirty = selectDirtyBoards(localBoards, state)
    if (dirty.length === 0) return { state, failures: [] }

    setStatus({ pendingCount: dirty.length })
    let next = state
    const failures: PushFailure[] = []

    for (const board of dirty) {
        // 縮圖沒變就整個欄位不送（upsert 語意下＝保留雲端現值）。
        // 實測 8KB 內容配 57KB 縮圖——改一個字重傳整張圖是純粹的浪費。
        // ⚠️ 只有「雲端已經有這塊板」時才能省，否則會 INSERT 出 thumbnail = null 的列；
        //    isThumbnailUnchanged 要求 thumbHash 有紀錄，正好涵蓋了這個條件。
        const skipThumbnail = isThumbnailUnchanged(next, board.id, board.thumbnail)
        const res = await pushBoard(board, { includeThumbnail: !skipThumbnail })

        if (!res.ok) {
            // ⚠️ 單一塊板失敗**不中止整輪**。早期版本會直接 throw，結果是
            // 一塊推不上去的板（太大、資料壞掉、撞到 RLS）會讓其他所有板
            // 連同拉取階段一起永遠同步不了，而畫面上只看得到一個籠統的錯誤。
            failures.push({ id: board.id, name: board.name, error: res.error ?? '推送失敗' })
            continue
        }
        next = markPushed(next, board.id, board.updatedAt)
        next = markThumbPushed(next, board.id, hashThumbnail(board.thumbnail))
    }
    return { state: next, failures }
}

/** 把這輪的失敗湊成一句人看得懂的話 */
function describeFailures(failures: PushFailure[], pullError: string | null): string {
    const parts: string[] = []
    if (failures.length === 1) {
        parts.push(`「${failures[0].name}」推不上去：${failures[0].error}`)
    } else if (failures.length > 1) {
        parts.push(`${failures.length} 塊白板推不上去（例：「${failures[0].name}」：${failures[0].error}）`)
    }
    if (pullError) parts.push(`拉取失敗：${pullError}`)
    return parts.join('；') || '未知錯誤'
}

/** 把雲端較新的板拉回來套用；正在開的那塊只提示不覆蓋 */
async function pullPhase(
    localBoards: BoardRecord[],
    state: SyncState,
): Promise<{ applied: BoardRecord[]; state: SyncState }> {
    const list = await listRemoteBoards()
    if (!list.ok) throw new Error(list.error ?? '讀取雲端清單失敗')

    const localById = new Map(localBoards.map(b => [b.id, b]))
    const applied: BoardRecord[] = []
    let next = state

    for (const remote of list.data ?? []) {
        const local = localById.get(remote.id)
        const decision = decideSync(local?.updatedAt ?? null, remote.updatedAt)
        if (decision !== 'pull' && decision !== 'remote-only') continue

        // 雲端有、本機沒有，而且我們**推過**這塊板 ⇒ 它是在本機被永久刪除的。
        // 這時候拉回來就是「刪了又自己長回來」。改成補一列墓碑讓雲端也知道它沒了。
        //
        // 例外：雲端那列比我們最後推上去的版本還新，代表另一台裝置在我們刪除之後又改過它——
        // 這種情況以「有人還在用」為準，正常拉回來，不當成刪除。
        if (decision === 'remote-only') {
            const lastPushed = next.pushed[remote.id]
            if (lastPushed !== undefined && remote.updatedAt <= lastPushed) {
                await pushTombstone({
                    id: remote.id, name: remote.name, snapshot: null, thumbnail: null,
                    updatedAt: remote.updatedAt,
                })
                continue
            }
        }

        // 正在開著的板：不覆蓋，只提示（第 4 項需求）。
        // 使用者可能正在這塊板上打字，一聲不響換掉畫布內容會直接毀掉他手上的工作。
        if (remote.id === activeBoardId && local) {
            notifyRemoteNewer(remote.id, remote.name, remote.updatedAt)
            continue
        }

        const got = await pullBoard(remote.id)
        if (!got.ok) throw new Error(got.error ?? '拉取失敗')
        if (!got.data) continue

        // ⚠️ 直接寫 db，不走 saveBoard——後者會通知引擎，把剛拉回來的東西再推一次
        await db.table('boards').put(got.data)
        next = markPulled(next, got.data.id, got.data.updatedAt)
        applied.push(got.data)
    }

    return { applied, state: next }
}

// ── 活躍板衝突提示（第 4 項）─────────────────────────────────────────────────

function notifyRemoteNewer(boardId: string, boardName: string, remoteUpdatedAt: number): void {
    // 同一個遠端版本只提示一次，否則每 60 秒的輪詢會一直彈同一則
    const key = `${boardId}:${remoteUpdatedAt}`
    if (notifiedConflicts.has(key)) return
    notifiedConflicts.add(key)

    emitAppEvent('sync-remote-newer', {
        boardId,
        boardName,
        remoteUpdatedAt,
        apply: () => applyRemoteBoard(boardId),
    })
}

/**
 * 使用者按下提示的「立即載入」後才走這條：把遠端版本拉下來覆蓋本機。
 * 這是整個引擎唯一會覆蓋「使用者正開著的板」的路徑，而且一定經過他本人點擊。
 */
export async function applyRemoteBoard(boardId: string): Promise<void> {
    const got = await pullBoard(boardId)
    if (!got.ok || !got.data) throw new Error(got.error ?? '雲端沒有這塊白板')

    await db.table('boards').put(got.data)

    const userId = await getCurrentUserId()
    saveSyncState(markPulled(loadSyncState(userId), got.data.id, got.data.updatedAt))

    emitAppEvent('sync-boards-updated', { boards: [got.data] })
}

// ── 墓碑（第 5 項：永久刪除也要讓另一端知道）─────────────────────────────────

async function pushTombstone(board: Pick<BoardRecord, 'id' | 'name'> & Partial<BoardRecord>): Promise<void> {
    const now = Date.now()
    // snapshot/thumbnail 清空：墓碑只需要「這個 id 已經沒了」這個事實，
    // 留著整包內容只是讓每塊刪掉的板永遠佔著雲端空間
    const tombstone: BoardRecord = {
        ...board,
        id: board.id,
        name: board.name,
        snapshot: null,
        thumbnail: null,
        deletedAt: now,
        updatedAt: now,
    }
    const res = await pushBoard(tombstone)
    if (!res.ok) throw new Error(res.error ?? '推送墓碑失敗')

    const userId = await getCurrentUserId()
    saveSyncState(markPushed(loadSyncState(userId), tombstone.id, tombstone.updatedAt))
}

// ── 測試用 ───────────────────────────────────────────────────────────────────

/** 只給單元測試用：把模組狀態歸零 */
export function __resetSyncEngineForTest(): void {
    stopSyncEngine()
    started = false
    activeBoardId = null
    running = false
    rerunRequested = false
    failureCount = 0
    status = INITIAL_SYNC_STATUS
    notifiedConflicts.clear()
}
