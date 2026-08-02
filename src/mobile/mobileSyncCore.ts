// src/mobile/mobileSyncCore.ts
// 手機速記的同步核心。**頁面與 service worker 共用同一份實作。**
//
// 為什麼不用 supabase-js：這份程式碼要被打包進 service worker，而 SW 裡沒有
// localStorage（supabase-js 的 session 儲存靠它）、也不該為了送一則速記就載入
// 整包 SDK。這裡改用原生 fetch 直接打 Supabase 的 REST 與 auth endpoint，
// 憑證從 IndexedDB 拿（見 mobileStore.ts）。
//
// 頁面端也走同一條路，而不是「頁面用 SDK、SW 用 REST」——兩份實作遲早會漂移，
// 而漂移的症狀會是「背景送出去的卡跟前景送出去的長得不一樣」，極難查。
import { INBOX_BOARD_ID } from '../constants'
import { appendQuickCaptureCard } from '../utils/quickCaptureCard'
import { getCardShapes } from '../utils/snapshot'
import { mergeSnapshots, describeMerge, hashSnapshotShapes } from '../utils/snapshotMerge'
import type { TLEditorSnapshot } from 'tldraw'
import {
    getOutbox, removeNotes, loadAuth, saveAuth, saveLastSyncedAt,
    type StoredAuth, type OutboxNote,
} from './mobileStore'

export interface FlushResult {
    ok: boolean
    /** 這次成功送上去的則數 */
    sent: number
    /** 還留在 outbox 裡的則數 */
    remaining: number
    /** 送出後收件匣總共有幾張卡——讓使用者在手機上就能確認東西真的進去了 */
    inboxCardCount?: number
    error?: string
}

/** access token 剩不到這麼久就先換新的（背景同步可能在很久以後才觸發）*/
const TOKEN_REFRESH_MARGIN_MS = 60_000

// ── REST 呼叫 ────────────────────────────────────────────────────────────────

function headers(auth: StoredAuth, extra: Record<string, string> = {}): Record<string, string> {
    return {
        apikey: auth.anonKey,
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json',
        ...extra,
    }
}

/**
 * 用 refresh token 換一組新的 access token。
 * 背景同步常常在 access token 過期之後才觸發（它有效期只有一小時左右），
 * 沒有這段的話「離線一晚、早上恢復連線」這個最典型的情境就會 401 失敗。
 */
export async function refreshAccessToken(auth: StoredAuth): Promise<StoredAuth | null> {
    try {
        const res = await fetch(`${auth.url}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: { apikey: auth.anonKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: auth.refreshToken }),
        })
        if (!res.ok) return null
        const data = await res.json() as {
            access_token?: string
            refresh_token?: string
            expires_in?: number
            user?: { id?: string }
        }
        if (!data.access_token || !data.refresh_token) return null
        const next: StoredAuth = {
            ...auth,
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            userId: data.user?.id ?? auth.userId,
            expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
        }
        await saveAuth(next)
        return next
    } catch {
        return null
    }
}

/** 快到期就先換新的，回傳可用的憑證；換不到回 null */
async function ensureFreshToken(auth: StoredAuth): Promise<StoredAuth | null> {
    if (auth.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) return auth
    return refreshAccessToken(auth)
}

interface InboxRow {
    id: string
    name: string
    snapshot: TLEditorSnapshot | null
    updated_at: number
    is_inbox: boolean | null
}

/**
 * 取雲端的收件匣。
 * ⚠️ `select` 刻意不含 `thumbnail`——手機端從不顯示縮圖，而它常常比內容本身還大
 * （桌機實測 8KB 內容配 57KB 縮圖）。在行動網路上，每記一則速記就來回搬一張
 * 用不到的圖是真的浪費。
 */
async function fetchInbox(auth: StoredAuth): Promise<{ ok: boolean; row: InboxRow | null; status: number; error?: string }> {
    try {
        const url = `${auth.url}/rest/v1/boards`
            + `?id=eq.${encodeURIComponent(INBOX_BOARD_ID)}`
            + `&select=id,name,snapshot,updated_at,is_inbox&limit=1`
        const res = await fetch(url, { headers: headers(auth) })
        if (!res.ok) return { ok: false, row: null, status: res.status, error: await describeRestError(res) }
        const rows = await res.json() as InboxRow[]
        return { ok: true, row: rows[0] ?? null, status: res.status }
    } catch (e) {
        return { ok: false, row: null, status: 0, error: describeNetworkError(e) }
    }
}

/**
 * 把收件匣整塊寫回去。
 * ⚠️ payload 一樣不含 `thumbnail`：upsert 的語意下，沒送的欄位在更新既有列時
 * 保持雲端現值——所以桌機產生的縮圖不會被手機清成 null。
 */
async function upsertInbox(
    auth: StoredAuth,
    row: { name: string; snapshot: TLEditorSnapshot | null; updatedAt: number },
): Promise<{ ok: boolean; status: number; error?: string }> {
    try {
        const res = await fetch(`${auth.url}/rest/v1/boards?on_conflict=user_id,id`, {
            method: 'POST',
            headers: headers(auth, {
                Prefer: 'resolution=merge-duplicates,return=minimal',
            }),
            body: JSON.stringify({
                id: INBOX_BOARD_ID,
                user_id: auth.userId,
                name: row.name,
                snapshot: row.snapshot,
                updated_at: row.updatedAt,
                is_inbox: true,
            }),
        })
        if (!res.ok) return { ok: false, status: res.status, error: await describeRestError(res) }
        return { ok: true, status: res.status }
    } catch (e) {
        return { ok: false, status: 0, error: describeNetworkError(e) }
    }
}

async function describeRestError(res: Response): Promise<string> {
    if (res.status === 401) return '登入已過期，請重新登入'
    try {
        const body = await res.json() as { message?: string; hint?: string }
        if (body.message) return body.message
    } catch { /* 不是 JSON 就用狀態碼 */ }
    return `伺服器回應 ${res.status}`
}

function describeNetworkError(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e)
    return /fetch|network/i.test(msg) ? '連不上網路' : msg
}

// ── 主流程 ───────────────────────────────────────────────────────────────────

/**
 * 把 outbox 裡的速記全部追加到雲端收件匣。
 *
 * ⚠️ 一定是「先拉最新的 → 在它上面追加 → 整塊推回去」。
 * 拿手機上的舊版本改了就推，會把這段期間桌機加進收件匣的卡整批蓋掉
 * （整板 last-write-wins 的代價，見 docs/roadmap-mobile.md 風險表）。
 */
export async function flushOutboxCore(): Promise<FlushResult> {
    const notes = await getOutbox()
    if (notes.length === 0) return { ok: true, sent: 0, remaining: 0 }

    const stored = await loadAuth()
    if (!stored) return { ok: false, sent: 0, remaining: notes.length, error: '尚未登入' }

    let auth = await ensureFreshToken(stored)
    if (!auth) return { ok: false, sent: 0, remaining: notes.length, error: '登入已過期，請重新登入' }

    let fetched = await fetchInbox(auth)
    // 就算剛換過 token 也可能撞到 401（例如伺服器端已撤銷）——再換一次再試一次
    if (!fetched.ok && fetched.status === 401) {
        const renewed = await refreshAccessToken(auth)
        if (!renewed) return { ok: false, sent: 0, remaining: notes.length, error: '登入已過期，請重新登入' }
        auth = renewed
        fetched = await fetchInbox(auth)
    }
    if (!fetched.ok) return { ok: false, sent: 0, remaining: notes.length, error: fetched.error }

    const base = fetched.row
    let snapshot: TLEditorSnapshot | null = base?.snapshot ?? null
    for (const note of notes) {
        // idPrefix 'm' 標記來自手機——日後排查「這張卡哪來的」時很有用
        snapshot = appendQuickCaptureCard(snapshot, note.text, 'm').snapshot
    }

    const pushed = await upsertInbox(auth, {
        // 雲端還沒有收件匣（從沒同步過）就地建一塊；id 與桌機同一個常數，
        // 所以桌機那邊會認得它、直接合進自己的收件匣，不會變成第二塊板
        name: base?.name ?? '📥 收件匣',
        snapshot,
        updatedAt: Date.now(),
    })
    if (!pushed.ok) return { ok: false, sent: 0, remaining: notes.length, error: pushed.error }

    await removeNotes(notes.map(n => n.id))
    await saveLastSyncedAt(Date.now())

    return {
        ok: true,
        sent: notes.length,
        remaining: (await getOutbox()).length,
        inboxCardCount: snapshot ? getCardShapes(snapshot).length : 0,
    }
}

// ── S2：唯讀瀏覽（白板清單／單塊板的卡片）────────────────────────────────
//
// 只讀不寫，所以與速記的 outbox 完全無關；但**共用同一套憑證與 token 更新**，
// 否則會出現「速記送得出去、清單卻 401」這種只有一半壞掉的狀態。

export interface MobileBoard {
    id: string
    name: string
    updatedAt: number
    isHome: boolean
    isInbox: boolean
    isJournal: boolean
    isFolder: boolean
}

interface BoardListRow {
    id: string
    name: string
    updated_at: number
    is_home: boolean | null
    is_inbox: boolean | null
    is_journal: boolean | null
    is_folder: boolean | null
    deleted_at: number | null
}

/**
 * 帶 token 更新的 GET。與 flushOutboxCore 同樣的兩段式：先確保 token 沒過期，
 * 真的撞到 401 再換一次重試一次（伺服器端可能已撤銷）。
 */
async function authedGet<T>(path: string): Promise<{ ok: boolean; data?: T; error?: string }> {
    const stored = await loadAuth()
    if (!stored) return { ok: false, error: '尚未登入' }
    let auth = await ensureFreshToken(stored)
    if (!auth) return { ok: false, error: '登入已過期，請重新登入' }

    const call = async (a: StoredAuth) => {
        const res = await fetch(`${a.url}${path}`, { headers: headers(a) })
        return { res, body: res.ok ? await res.json() as T : null }
    }

    try {
        let { res, body } = await call(auth)
        if (res.status === 401) {
            const renewed = await refreshAccessToken(auth)
            if (!renewed) return { ok: false, error: '登入已過期，請重新登入' }
            auth = renewed
            ;({ res, body } = await call(auth))
        }
        if (!res.ok) return { ok: false, error: await describeRestError(res) }
        return { ok: true, data: body as T }
    } catch (e) {
        return { ok: false, error: describeNetworkError(e) }
    }
}

/**
 * 取白板清單。
 * ⚠️ `select` 刻意**不含 snapshot 也不含 thumbnail**——清單只需要名字，
 * 而 snapshot 是整列最大的東西（好幾 MB）。在行動網路上，為了畫一份清單
 * 就把所有白板的內容全下載一次是不能接受的；snapshot 等點進去那一塊才拉。
 *
 * 資料夾也排除：手機端不做資料夾層級，直接平鋪比較好按。
 */
export async function fetchBoardsCore(): Promise<{ ok: boolean; boards?: MobileBoard[]; error?: string }> {
    const r = await authedGet<BoardListRow[]>(
        '/rest/v1/boards?select=id,name,updated_at,is_home,is_inbox,is_journal,is_folder,deleted_at'
        + '&order=updated_at.desc',
    )
    if (!r.ok || !r.data) return { ok: false, error: r.error }

    const boards = r.data
        // 墓碑與垃圾桶裡的板都有 deleted_at，兩者在手機上都不該出現
        .filter(row => row.deleted_at === null && !row.is_folder)
        .map(row => ({
            id: row.id,
            name: row.name,
            updatedAt: row.updated_at,
            isHome: !!row.is_home,
            isInbox: !!row.is_inbox,
            isJournal: !!row.is_journal,
            isFolder: !!row.is_folder,
        }))
    return { ok: true, boards }
}

/**
 * 取單一塊板的 snapshot。這是唯一會下載大量資料的呼叫，所以只在使用者
 * 真的點進某塊板時才發生。
 */
export async function fetchBoardSnapshotCore(
    boardId: string,
): Promise<{
    ok: boolean
    snapshot?: TLEditorSnapshot | null
    /** 讀到的當下就算好的指紋——這是之後寫回時三方合併的**共同祖先** */
    baseHashes?: Record<string, string>
    error?: string
}> {
    const r = await authedGet<{ snapshot: TLEditorSnapshot | null }[]>(
        `/rest/v1/boards?id=eq.${encodeURIComponent(boardId)}&select=snapshot&limit=1`,
    )
    if (!r.ok || !r.data) return { ok: false, error: r.error }
    if (r.data.length === 0) return { ok: false, error: '雲端沒有這塊白板' }
    const snapshot = r.data[0].snapshot
    return { ok: true, snapshot, baseHashes: hashSnapshotShapes(snapshot) }
}

// ── S3：手機端寫回（帶卡片級合併）───────────────────────────────────────
//
// ⚠️⚠️ **手機一旦能寫，手機與桌機就會產生真的衝突。**
// 桌機那邊的合併靠 `syncState.shapeHashes` 當共同祖先，但那份存在桌機的
// localStorage，手機拿不到。手機端要有等價的一份，否則每次寫入都會退回
// 「整塊覆蓋」，把桌機這段期間的修改全部蓋掉。
//
// 手機的 base 從哪來：**讀那塊板的當下就算好**（fetchBoardSnapshotCore 的回傳
// 一起算），存在記憶體裡帶著走。編輯 session 很短（讀 → 改 → 存），不需要跨重啟——
// App 重開就重讀一次，那本來就會拿到新的 base。
//
// ⚠️ 沒有離線編輯佇列：存不出去就當場報錯、內容留在畫面上讓使用者重試。
// 速記有 outbox 是因為「打完就關掉」很常見；編輯則是使用者正看著那張卡，
// 當場告訴他沒存成功，比默默排隊之後再合併要誠實得多。

export interface SaveBoardResult {
    ok: boolean
    error?: string
    /** 合併後真正存進雲端的 snapshot（畫面要用它重畫，才會看到對方的修改）*/
    snapshot?: TLEditorSnapshot | null
    /** 這次合併從雲端收到了什麼；沒有變化時為 null */
    mergeSummary?: string | null
}

/**
 * 把改過的 snapshot 存回雲端，**存之前先與雲端最新版三方合併**。
 *
 * 順序與桌機的 pushPhase 一致，理由也一樣：直接 upsert 會把另一端這段期間的
 * 修改整塊蓋掉，而且沒有任何徵兆。
 */
export async function saveBoardWithMergeCore(
    boardId: string,
    baseHashes: Record<string, string>,
    localSnapshot: TLEditorSnapshot | null,
): Promise<SaveBoardResult> {
    const stored = await loadAuth()
    if (!stored) return { ok: false, error: '尚未登入' }
    const auth = await ensureFreshToken(stored)
    if (!auth) return { ok: false, error: '登入已過期，請重新登入' }

    // 1) 拿雲端最新版（可能已經被桌機改過）
    const fresh = await authedGet<{ snapshot: TLEditorSnapshot | null; updated_at: number; name: string }[]>(
        `/rest/v1/boards?id=eq.${encodeURIComponent(boardId)}&select=snapshot,updated_at,name&limit=1`,
    )
    if (!fresh.ok || !fresh.data) return { ok: false, error: fresh.error }
    if (fresh.data.length === 0) return { ok: false, error: '雲端沒有這塊白板' }
    const remote = fresh.data[0]

    // 2) 三方合併。同一張卡兩邊都改時**讓遠端贏**——手機上的編輯多半是隨手一改，
    //    桌機那邊通常是正在專心做事的版本，衝突時保守一點。
    const merged = mergeSnapshots(baseHashes, localSnapshot, remote.snapshot, {
        preferRemoteOnConflict: true,
    })

    // 3) 推回去。updatedAt 推進到現在——合併結果是兩邊都沒有過的新版本，
    //    時間戳必須比雙方都大，否則桌機會覺得「我的比較新」再蓋一次。
    const now = Date.now()
    try {
        const res = await fetch(`${auth.url}/rest/v1/boards?on_conflict=user_id,id`, {
            method: 'POST',
            headers: headers(auth, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
            body: JSON.stringify({
                id: boardId,
                user_id: auth.userId,
                name: remote.name,
                snapshot: merged.snapshot,
                updated_at: now,
                // ⚠️ 不送 thumbnail：upsert 語意下沒送的欄位保持雲端現值，
                // 桌機產生的縮圖才不會被手機清成 null
            }),
        })
        if (!res.ok) return { ok: false, error: await describeRestError(res) }
    } catch (e) {
        return { ok: false, error: describeNetworkError(e) }
    }

    await saveLastSyncedAt(now)
    return { ok: true, snapshot: merged.snapshot, mergeSummary: describeMerge(merged.stats) }
}

export type { OutboxNote, StoredAuth }
