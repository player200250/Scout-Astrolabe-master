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
    /**
     * 手機速記 PWA 的網址（例：https://xxx.github.io/Scout-Astrolabe-master/）。
     * 只用來產生「手機設定連結」，不參與同步本身。
     */
    mobileUrl?: string
}

const EMPTY: SyncConfig = { url: '', anonKey: '', autoSync: true, mobileUrl: '' }

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
            mobileUrl: parsed.mobileUrl ?? '',
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
            mobileUrl: (config.mobileUrl ?? '').trim(),
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

// ── 手機設定連結 ─────────────────────────────────────────────────────────────
//
// 在手機上手打那串 anon key 很痛苦，但也不想把它烤進公開部署的 JS 裡。
// 折衷做法：桌機產一個把設定放在 **URL fragment**（`#cfg=…`）的連結，
// 使用者用任何方式傳到自己手機、點一下就填好。
//
// 選 fragment 而不是 query string 是有理由的：**`#` 後面的內容不會隨 HTTP 請求送出**，
// 所以那串 key 不會出現在任何伺服器或代理的存取紀錄裡。手機端讀完會立刻把它從網址列清掉。

const CONFIG_HASH_KEY = 'cfg'

/** UTF-8 安全的 base64（anon key 是 ASCII，但 URL 有可能不是）*/
function toBase64(text: string): string {
    const bytes = new TextEncoder().encode(text)
    let binary = ''
    bytes.forEach(b => { binary += String.fromCharCode(b) })
    return btoa(binary)
}

function fromBase64(encoded: string): string {
    const binary = atob(encoded)
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
}

/**
 * 產生手機設定連結。`mobileUrl` 沒填時只回 `#cfg=…` 片段，
 * 讓使用者自己接在網址後面（例如還在用區網 preview 測的時候）。
 */
export function buildMobileConfigLink(config: SyncConfig = loadSyncConfig()): string {
    const payload = toBase64(JSON.stringify({ url: config.url, anonKey: config.anonKey }))
    const base = (config.mobileUrl ?? '').trim().replace(/#.*$/, '')
    return base ? `${base}${base.includes('#') ? '' : '#'}${CONFIG_HASH_KEY}=${payload}` : `#${CONFIG_HASH_KEY}=${payload}`
}

/**
 * 從網址片段解出設定。手機端啟動時呼叫；沒有或解不開一律回 null（不要讓 App 掛掉）。
 */
export function parseMobileConfigLink(hash: string): Pick<SyncConfig, 'url' | 'anonKey'> | null {
    const match = /(?:^|[#&])cfg=([^&]+)/.exec(hash)
    if (!match) return null
    try {
        const parsed = JSON.parse(fromBase64(decodeURIComponent(match[1]))) as Partial<SyncConfig>
        if (typeof parsed.url !== 'string' || typeof parsed.anonKey !== 'string') return null
        if (!parsed.url || !parsed.anonKey) return null
        return { url: parsed.url, anonKey: parsed.anonKey }
    } catch {
        return null
    }
}
