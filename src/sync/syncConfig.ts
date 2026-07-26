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
}

const EMPTY: SyncConfig = { url: '', anonKey: '' }

export function loadSyncConfig(): SyncConfig {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return EMPTY
        const parsed = JSON.parse(raw) as Partial<SyncConfig>
        return { url: parsed.url ?? '', anonKey: parsed.anonKey ?? '' }
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
