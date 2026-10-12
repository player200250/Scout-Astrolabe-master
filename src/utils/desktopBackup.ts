// src/utils/desktopBackup.ts
//
// Scout Desktop「資料安全」卡：最新一份硬碟備份（文件\Scout Astrolabe 備份）是多久以前。
// 看硬碟備份不看 App 內備份：2026-10-05 事故時，App 內備份跟白板在同一個 IndexedDB，一起沒了。
//
// 時間由 main process 從備份檔名讀出來（desktop:get-backup-status），不經過白板資料。純函式。

export type BackupLevel = 'ok' | 'warn' | 'danger'

export interface BackupAge {
    level: BackupLevel
    /** 「3 小時前」「2 天前」；沒有備份時是「還沒有備份」 */
    text: string
}

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** 超過 1 天變黃、超過 3 天變紅（計畫 2026-10-12） */
export const BACKUP_WARN_MS = DAY
export const BACKUP_DANGER_MS = 3 * DAY

export function describeBackupAge(latest: number | null, now: number): BackupAge {
    if (latest === null) return { level: 'danger', text: '還沒有備份' }
    // 時鐘被調過、檔名比現在還新：當成剛剛
    const diff = Math.max(0, now - latest)
    const level: BackupLevel = diff > BACKUP_DANGER_MS ? 'danger' : diff > BACKUP_WARN_MS ? 'warn' : 'ok'
    const min = Math.floor(diff / 60_000)
    let text: string
    if (min < 1) text = '剛剛'
    else if (min < 60) text = `${min} 分鐘前`
    else if (diff < DAY) text = `${Math.floor(diff / HOUR)} 小時前`
    else text = `${Math.floor(diff / DAY)} 天前`
    return { level, text }
}
