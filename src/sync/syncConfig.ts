// src/sync/syncConfig.ts
// 雲端同步的連線設定（S0(b)）。
//
// 存在 localStorage 而不是 .env 的理由：改設定不必重新 build，金鑰不會進 git，
// 未來手機 PWA 端也是同一套填法。anon key 是設計上可公開的值（會被打包進前端），
// 真正的防線是 Supabase 的 RLS（見 supabase/schema.sql）。

const STORAGE_KEY = 'astrolabe-sync-config'

export interface SyncConfig {
    /** Supabase Project URL，例：https://xxxxx.supabase.co */
    url: string
    /** Supabase anon (public) key */
    anonKey: string
    /**
     * 自動同步（存檔後推送＋定時拉取）。**省略或 undefined 一律視為開啟**——
     * S0(b) 探路期存的舊設定沒有這個欄位，不該因此變成沒在同步。
     * 關掉之後 syncEngine 完全不排程，只剩雲端同步面板裡的手動動作可用。
     */
    autoSync?: boolean
}

const EMPTY: SyncConfig = { url: '', anonKey: '', autoSync: true }

export function loadSyncConfig(): SyncConfig {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return EMPTY
        const parsed = JSON.parse(raw) as Partial<SyncConfig>
        return {
            url: parsed.url ?? '',
            anonKey: parsed.anonKey ?? '',
            // 舊設定（S0(b) 探路期存的）沒有這個欄位＝視為開啟
            autoSync: parsed.autoSync !== false,
        }
    } catch {
        return EMPTY
    }
}

/**
 * 把使用者貼進來的東西正規化成 supabase-js 要的 **origin**（`https://xxx.supabase.co`）。
 *
 * ⚠️ 這裡的重點是**砍掉路徑**：Supabase 後台有些欄位顯示的是 Data API endpoint
 * `https://xxx.supabase.co/rest/v1`，直接貼進來的話 supabase-js 會在後面再接一段，
 * 組出 `/rest/v1/auth/v1/token` 這種不存在的路徑，登入就 404（實際踩過）。
 * 順手補上沒打的 scheme，以及去掉前後空白與尾端斜線。
 */
export function normalizeSupabaseUrl(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) return ''
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    try {
        return new URL(withScheme).origin
    } catch {
        // 連 URL 都 parse 不了就原樣留著，讓 isSyncConfigured 去擋、使用者自己看得到填錯了
        return trimmed.replace(/\/+$/, '')
    }
}

export function saveSyncConfig(config: SyncConfig): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            url: normalizeSupabaseUrl(config.url),
            anonKey: config.anonKey.trim(),
            autoSync: config.autoSync !== false,
        }))
    } catch { /* localStorage 滿了或被禁用：同步設定不存也不該讓 App 掛掉 */ }
}

export function clearSyncConfig(): void {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* 同上 */ }
}

/** 設定是否填得像樣（只做格式檢查，能不能連上要真的打過才知道）*/
export function isSyncConfigured(config: SyncConfig = loadSyncConfig()): boolean {
    return /^https?:\/\/.+/.test(config.url.trim()) && config.anonKey.trim().length > 20
}

/** 自動同步是否該啟動：設定填好了、而且沒被使用者關掉 */
export function isAutoSyncEnabled(config: SyncConfig = loadSyncConfig()): boolean {
    return isSyncConfigured(config) && config.autoSync !== false
}

/** 只切換自動同步開關，不動連線設定 */
export function setAutoSync(enabled: boolean): void {
    saveSyncConfig({ ...loadSyncConfig(), autoSync: enabled })
}
