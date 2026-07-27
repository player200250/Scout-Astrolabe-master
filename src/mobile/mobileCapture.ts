// src/mobile/mobileCapture.ts
// 手機速記的頁面端門面（S1）。
//
// 設計的第一原則：**打完字按送出，那段文字就不能再弄丟**。
// 人在外面、訊號時有時無，如果「送出」等於「打 API」，那沒訊號的時候就是打了白打。
// 所以流程一律是：
//
//     1. 先寫進本機 outbox（IndexedDB，不碰網路）
//     2. 再試著把 outbox 沖到雲端；失敗就留著，下次開啟／回到前台／恢復連線時重試，
//        並登記一次 Background Sync，讓瀏覽器在 App 沒開時也有機會幫我們送出去
//
// 真正的推拉在 mobileSyncCore.ts（頁面與 service worker 共用同一份）。
import { loadSyncConfig } from '../sync/syncConfig'
import { flushOutboxCore, type FlushResult } from './mobileSyncCore'
import {
    getOutbox, addNote, saveAuth, clearAuth, migrateLegacyOutbox,
    loadLastSyncedAt, type OutboxNote,
} from './mobileStore'

/** service worker 的 Background Sync 標籤；sw.ts 用同一個字串 */
export const BACKGROUND_SYNC_TAG = 'astrolabe-flush-outbox'

export { getOutbox, migrateLegacyOutbox, loadLastSyncedAt }
export type { OutboxNote, FlushResult }

// ── 記一則 ───────────────────────────────────────────────────────────────────

/** 把一段文字放進 outbox。不碰網路，只要 IndexedDB 寫得進去就算成功。 */
export async function enqueueNote(text: string): Promise<OutboxNote> {
    const note: OutboxNote = {
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        text: text.trim(),
        createdAt: Date.now(),
    }
    await addNote(note)
    return note
}

// ── 沖到雲端（含互斥）─────────────────────────────────────────────────────────

let inflight: Promise<FlushResult> | null = null

/**
 * 把 outbox 沖到雲端。
 *
 * ⚠️ **同一時間只允許跑一輪。** flush 有三個觸發點（開啟 App、恢復連線、按下送出），
 * 沒有這道鎖的話兩輪會各自拉同一份雲端收件匣、各自追加後推上去：
 * 後推的蓋掉先推的；而且若前一輪已經清掉 outbox，後一輪會把同一則再追加一次
 * ＝雲端出現**重複卡片**。這是實際存在過的 bug，不是理論上的。
 */
export function flushOutbox(): Promise<FlushResult> {
    if (inflight) {
        return inflight.then(async prev => {
            // 上一輪讀完清單之後才按下的那一則不會被它帶到，補跑一輪。
            // 只在上一輪成功時才補——失敗（多半是離線）就等下次觸發，
            // 否則每個等待者都會再引發一次注定失敗的嘗試。
            if (prev.ok && (await getOutbox()).length > 0) return flushOutbox()
            return prev
        })
    }

    const run = (async () => {
        const result = await flushOutboxCore()
        // 送不出去就交給瀏覽器：連線恢復時它會喚醒 service worker 再試一次，
        // 即使那時候 App 已經被關掉了（Android）。iOS 不支援，會安靜地失敗。
        if (!result.ok && result.remaining > 0) await requestBackgroundSync()
        return result
    })().finally(() => { inflight = null })

    inflight = run
    return run
}

/** SyncManager 還不在標準 DOM 型別裡，只好自己描述需要的那一小塊 */
interface SyncCapableRegistration extends ServiceWorkerRegistration {
    sync?: { register: (tag: string) => Promise<void> }
}

async function requestBackgroundSync(): Promise<void> {
    try {
        if (!('serviceWorker' in navigator)) return
        const reg = await navigator.serviceWorker.ready as SyncCapableRegistration
        await reg.sync?.register(BACKGROUND_SYNC_TAG)
    } catch {
        // iOS Safari 沒有 Background Sync；被拒絕或不支援都不是錯誤，
        // 速記仍在 outbox 裡，靠「回到前台就補送」那條路徑處理
    }
}

// ── 憑證（給 service worker 用）──────────────────────────────────────────────

/**
 * 把目前的 session 抄一份進 IndexedDB，讓 service worker 在背景也打得到 Supabase。
 *
 * supabase-js 的 session 存在 localStorage，而 **service worker 讀不到 localStorage**，
 * 所以登入後與每次同步後都要同步一份過去（token 會被 supabase-js 自動換新）。
 */
export async function rememberSession(session: {
    access_token: string
    refresh_token: string
    expires_at?: number
    expires_in?: number
    user: { id: string }
} | null | undefined): Promise<void> {
    if (!session) return
    const config = loadSyncConfig()
    if (!config.url || !config.anonKey) return

    await saveAuth({
        url: config.url,
        anonKey: config.anonKey,
        userId: session.user.id,
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        // expires_at 是 epoch 秒；沒給就用 expires_in 推算
        expiresAt: session.expires_at != null
            ? session.expires_at * 1000
            : Date.now() + (session.expires_in ?? 3600) * 1000,
    })
}

export async function forgetSession(): Promise<void> {
    await clearAuth()
}
