// src/mobile/mobileStore.ts
// 手機端的本機儲存（outbox 與憑證），用 **IndexedDB** 而不是 localStorage。
//
// 為什麼非 IndexedDB 不可：service worker **讀不到 localStorage**。
// 背景同步（Background Sync）的整個重點就是「App 沒開著的時候也能把速記送出去」，
// 那時候只有 service worker 在跑，它必須自己拿得到待送清單與憑證——
// 這兩樣東西一旦放在 localStorage，背景同步就永遠只是個裝飾。
//
// 刻意用原生 IndexedDB 而不是 Dexie：這份程式碼會被打包進 service worker，
// 那顆 bundle 越小越好，而這裡要的只是「兩個 store、幾個 get/put」。
//
// ⚠️ 憑證（access / refresh token）存在這裡，暴露程度與 supabase-js 原本就在用的
// localStorage 相同，沒有變得更不安全；真正的防線一樣是 Supabase 的 RLS。

const DB_NAME = 'astrolabe-mobile'
const DB_VERSION = 1
const STORE_OUTBOX = 'outbox'
const STORE_META = 'meta'

/** 舊版把 outbox 存在這個 localStorage 鍵，開啟時會一次性搬過來 */
const LEGACY_OUTBOX_KEY = 'astrolabe-mobile-outbox'

export interface OutboxNote {
    id: string
    text: string
    createdAt: number
}

/** service worker 裡沒有 window，但 self.indexedDB 一樣可用 */
const idb = (): IDBFactory => (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise
    dbPromise = new Promise((resolve, reject) => {
        const req = idb().open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
                db.createObjectStore(STORE_OUTBOX, { keyPath: 'id' })
            }
            if (!db.objectStoreNames.contains(STORE_META)) {
                db.createObjectStore(STORE_META)
            }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
    // 開失敗就讓下次重試，不要把失敗的 promise 永遠快取住
    dbPromise.catch(() => { dbPromise = null })
    return dbPromise
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

// ── outbox ───────────────────────────────────────────────────────────────────

export async function getOutbox(): Promise<OutboxNote[]> {
    try {
        const db = await openDb()
        const notes = await promisify(
            db.transaction(STORE_OUTBOX, 'readonly').objectStore(STORE_OUTBOX).getAll() as IDBRequest<OutboxNote[]>,
        )
        // 依建立時間排序＝送出去的順序與當初記下的順序一致
        return notes.sort((a, b) => a.createdAt - b.createdAt)
    } catch {
        return []
    }
}

export async function addNote(note: OutboxNote): Promise<void> {
    const db = await openDb()
    const tx = db.transaction(STORE_OUTBOX, 'readwrite')
    tx.objectStore(STORE_OUTBOX).put(note)
    await txDone(tx)
}

export async function removeNotes(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const db = await openDb()
    const tx = db.transaction(STORE_OUTBOX, 'readwrite')
    const store = tx.objectStore(STORE_OUTBOX)
    ids.forEach(id => store.delete(id))
    await txDone(tx)
}

function txDone(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
    })
}

// ── meta（憑證、上次同步時間…）─────────────────────────────────────────────────

export async function getMeta<T>(key: string): Promise<T | null> {
    try {
        const db = await openDb()
        const value = await promisify(
            db.transaction(STORE_META, 'readonly').objectStore(STORE_META).get(key) as IDBRequest<T | undefined>,
        )
        return value ?? null
    } catch {
        return null
    }
}

export async function setMeta(key: string, value: unknown): Promise<void> {
    const db = await openDb()
    const tx = db.transaction(STORE_META, 'readwrite')
    tx.objectStore(STORE_META).put(value, key)
    await txDone(tx)
}

// ── 憑證 ─────────────────────────────────────────────────────────────────────

/**
 * service worker 要自己打 Supabase REST 所需的一切。
 * 由頁面在登入後與每次成功同步後寫入（supabase-js 會自動換新 token，
 * 頁面順手把最新的抄一份進來給 SW 用）。
 */
export interface StoredAuth {
    url: string
    anonKey: string
    userId: string
    accessToken: string
    refreshToken: string
    /** access token 到期時間（epoch 毫秒）；背景同步時用來決定要不要先換新的 */
    expiresAt: number
}

const AUTH_KEY = 'auth'
const LAST_SYNCED_KEY = 'lastSyncedAt'

export const loadAuth = () => getMeta<StoredAuth>(AUTH_KEY)
export const saveAuth = (auth: StoredAuth) => setMeta(AUTH_KEY, auth)
export const clearAuth = () => setMeta(AUTH_KEY, null)

export const loadLastSyncedAt = () => getMeta<number>(LAST_SYNCED_KEY)
export const saveLastSyncedAt = (at: number) => setMeta(LAST_SYNCED_KEY, at)

// ── 舊資料遷移 ───────────────────────────────────────────────────────────────

/**
 * 把舊版存在 localStorage 的 outbox 搬進 IndexedDB。
 * 只在頁面端呼叫（service worker 沒有 localStorage，也搬不了）。
 * 搬完才清掉來源——中途失敗的話下次開啟會再試一次，不會弄丟。
 */
export async function migrateLegacyOutbox(): Promise<number> {
    let raw: string | null = null
    try { raw = localStorage.getItem(LEGACY_OUTBOX_KEY) } catch { return 0 }
    if (!raw) return 0

    let notes: OutboxNote[] = []
    try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) notes = parsed as OutboxNote[]
    } catch { /* 壞掉的內容就當沒有 */ }

    for (const note of notes) {
        if (note && typeof note.id === 'string' && typeof note.text === 'string') {
            await addNote({ id: note.id, text: note.text, createdAt: note.createdAt ?? Date.now() })
        }
    }
    try { localStorage.removeItem(LEGACY_OUTBOX_KEY) } catch { /* 清不掉也無妨，addNote 以 id 為鍵不會重複 */ }
    return notes.length
}
