// backupRetention.js — 硬碟備份檔（文件\Scout Astrolabe 備份）的檔名與保留規則
//
// 2026-10-05 事故的教訓：App 內建的自動備份跟白板存在同一個 IndexedDB，資料庫被刪就一起沒了。
// 所以另外把整份 vault 寫成 JSON 檔、放在 App 資料夾之外。
//
// 保留規則刻意「近的密、遠的疏」：
//   - 最新 KEEP_RECENT 份全留（約一天的每小時備份）
//   - 另外每個日曆日留當天最後一份，保留 KEEP_DAYS 天
// 這樣就算資料被清空、之後又連續寫了幾份「空的」備份，**前幾天的完整備份仍然在**——
// 單純「只留最新 N 份」的規則會被壞資料一路擠掉。
//
// 純函式、不 import electron，才能在 vitest 裡直接測。

export const BACKUP_PREFIX = 'vault-'
export const KEEP_RECENT = 24
export const KEEP_DAYS = 30
/** 兩份備份檔之間至少間隔多久（主程序據此節流，跨 renderer 重新載入也算數） */
export const MIN_INTERVAL_MS = 55 * 60 * 1000

const pad = n => String(n).padStart(2, '0')

/** Date → `vault-20261005-2207.json`（本地時間） */
export function backupFileName(date) {
    return `${BACKUP_PREFIX}${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`
}

/** `vault-20261005-2207.json` → Date；不是備份檔回 null */
export function parseBackupFileName(name) {
    const m = /^vault-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\.json$/.exec(name)
    if (!m) return null
    const [, y, mo, d, h, mi] = m.map(Number)
    return new Date(y, mo - 1, d, h, mi)
}

/**
 * @param {string[]} names 備份資料夾裡的檔名（非備份檔會被忽略、永遠不刪）
 * @param {Date} now
 * @returns {string[]} 應刪除的檔名
 */
export function selectBackupsToDelete(names, now) {
    const backups = names
        .map(name => ({ name, date: parseBackupFileName(name) }))
        .filter(b => b.date)
        .sort((a, b) => b.date - a.date)   // 新 → 舊
    const keep = new Set(backups.slice(0, KEEP_RECENT).map(b => b.name))
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (KEEP_DAYS - 1))
    const seenDays = new Set()
    for (const b of backups) {
        if (b.date < cutoff) continue
        const day = `${b.date.getFullYear()}-${b.date.getMonth()}-${b.date.getDate()}`
        if (seenDays.has(day)) continue
        seenDays.add(day)
        keep.add(b.name)   // 每天最新的那一份
    }
    return backups.filter(b => !keep.has(b.name)).map(b => b.name)
}
