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

export function saveSyncConfig(config: SyncConfig): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            url: config.url.trim().replace(/\/+$/, ''), // 去掉尾端斜線，否則組出來的 API path 會多一槓
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
