/**
 * 自動備份保留份數的使用者設定（N17）。
 *
 * 原本 `MAX_BACKUPS` 是寫死的 5。那個 5 不是隨便挑的：每份備份都是「全部白板的完整
 * snapshot」的複製，2026-06-21 由 30 降為 5 是為了修 renderer OOM 白屏
 * （見 docs/maintenance/bugs.md 的 P1-OOM）。所以這裡開放調整，但**刻意不給 30**：
 * 圖片卡雖已改存實體檔（TD-IMG），整板縮圖仍是 base64、仍會被每份備份複製一次。
 *
 * 存 localStorage 而非 Dexie：這是「這台機器怎麼保存」的偏好，不該跟著白板資料同步到雲端
 * 或匯出檔裡（與 syncConfig 同一個理由）。讀寫全程 try/catch——service worker／
 * 測試環境沒有 localStorage 時要退回預設值，不能讓備份流程整條炸掉。
 */

/** 可選份數。上限 20＝在「多留幾份」與 OOM 風險之間的折衷。 */
export const BACKUP_LIMIT_OPTIONS = [3, 5, 10, 20] as const

export const DEFAULT_BACKUP_LIMIT = 5

const STORAGE_KEY = 'astrolabe.backupLimit'

/**
 * 把任意輸入收斂成合法份數。純函式，設定值來自 localStorage（使用者可能手改壞）
 * 或舊版本殘留，一律過這裡。
 */
export function normalizeBackupLimit(raw: unknown): number {
    const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10)
    if (!Number.isFinite(n)) return DEFAULT_BACKUP_LIMIT
    // 不在選項內就取最接近的合法值，而不是直接退回預設——
    // 使用者手改成 12 的意圖顯然比較接近 10，不是 5。
    // 從最小選項起算，所以距離相同時（例如 4）會收斂到**小的那邊**：
    // 這個設定越大越吃空間，模稜兩可時往安全的方向靠。
    return BACKUP_LIMIT_OPTIONS.reduce<number>((best, opt) =>
        Math.abs(opt - n) < Math.abs(best - n) ? opt : best
    , BACKUP_LIMIT_OPTIONS[0])
}

export function getBackupLimit(): number {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw == null) return DEFAULT_BACKUP_LIMIT
        return normalizeBackupLimit(raw)
    } catch {
        return DEFAULT_BACKUP_LIMIT
    }
}

/** 回傳實際寫入的值（已正規化）。 */
export function setBackupLimit(limit: number): number {
    const normalized = normalizeBackupLimit(limit)
    try {
        localStorage.setItem(STORAGE_KEY, String(normalized))
    } catch { /* 沒有 localStorage 就只影響這次工作階段 */ }
    return normalized
}
