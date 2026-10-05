// backupRetention.js 的型別宣告（main.js 是純 JS；給 src/ 裡的 TS 測試用）
export declare const BACKUP_PREFIX: string
export declare const KEEP_RECENT: number
export declare const KEEP_DAYS: number
export declare const MIN_INTERVAL_MS: number
export declare function backupFileName(date: Date): string
export declare function parseBackupFileName(name: string): Date | null
export declare function selectBackupsToDelete(names: string[], now: Date): string[]
