// src/sync/supabaseClient.ts
// Supabase client 的唯一取得點（S0(b)）。
//
// 刻意做成 lazy + 可重建：連線設定是使用者在 App 內填的（見 syncConfig.ts），
// 填完/改完要能立刻生效，不能在模組載入時就把 client 定死。
//
// ⚠️ 未設定時一律回 null，呼叫端必須自己處理——這樣「沒設定雲端同步」的使用者
// 完全不會碰到任何 Supabase 程式碼路徑（ADR 0006：同步是可選的附加層）。
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'
import { loadSyncConfig, isSyncConfigured, type SyncConfig } from './syncConfig'

let client: SupabaseClient | null = null
let clientKey = '' // 用來偵測設定變了要重建

export function getSupabase(): SupabaseClient | null {
    const config = loadSyncConfig()
    if (!isSyncConfigured(config)) return null

    const key = `${config.url}|${config.anonKey}`
    if (client && clientKey === key) return client

    client = createClient(config.url, config.anonKey, {
        auth: {
            persistSession: true,   // session 存 localStorage → 重開 App 不用再登入
            autoRefreshToken: true,
        },
    })
    clientKey = key
    return client
}

/** 設定被改動或登出後呼叫，強制下次重建 client */
export function resetSupabase(): void {
    client = null
    clientKey = ''
}

// ── 認證（單帳號 + RLS）─────────────────────────────────────────────────────

export interface AuthResult {
    ok: boolean
    /** 失敗原因（已轉成中文；成功時為 undefined）*/
    error?: string
    session?: Session | null
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
    const supabase = getSupabase()
    if (!supabase) return { ok: false, error: '尚未填寫 Project URL 與 anon key' }
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) return { ok: false, error: translateAuthError(error.message) }
        return { ok: true, session: data.session }
    } catch (e) {
        return { ok: false, error: describeNetworkError(e) }
    }
}

export async function signOut(): Promise<void> {
    const supabase = getSupabase()
    if (!supabase) return
    try { await supabase.auth.signOut() } catch { /* 登出失敗不影響本機使用 */ }
}

export async function getCurrentSession(): Promise<Session | null> {
    const supabase = getSupabase()
    if (!supabase) return null
    try {
        const { data } = await supabase.auth.getSession()
        return data.session
    } catch {
        return null
    }
}

/** 目前登入者的 user id；未登入回 null。寫入 boards 時要帶（RLS 會再驗一次）*/
export async function getCurrentUserId(): Promise<string | null> {
    return (await getCurrentSession())?.user.id ?? null
}

// ── 錯誤訊息轉換 ─────────────────────────────────────────────────────────────
// Supabase 的英文錯誤直接吐給使用者很難懂，這裡把最常見的幾種轉成人話。

export function translateAuthError(message: string): string {
    const m = message.toLowerCase()
    if (m.includes('invalid login credentials')) return 'Email 或密碼錯誤'
    if (m.includes('email not confirmed')) return '這個帳號還沒完成 Email 驗證（可在 Supabase 後台的 Authentication 直接把它設為已驗證）'
    if (m.includes('failed to fetch') || m.includes('networkerror')) return '連不上 Supabase：請確認 Project URL 正確且網路通暢'
    if (m.includes('invalid api key')) return 'anon key 不正確'
    return message
}

export function describeNetworkError(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e)
    if (/fetch|network/i.test(msg)) return `連不上 Supabase（${msg}）。請確認 Project URL 正確、網路通暢`
    return msg
}

export type { SyncConfig }
