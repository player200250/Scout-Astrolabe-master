import { useEffect, useRef, useCallback } from 'react'
import { saveAutoBackup, type BoardRecord } from '../db'
import { BACKUP_THROTTLE_MS } from '../constants'
import { isImageMigrationRunning } from '../utils/migrationState'
import { writeDiskBackup } from '../platform/backupFile'

/**
 * 自動備份：節流的手動觸發 + 分頁隱藏時自動備份。
 * - triggerAutoBackup(boards)：距上次備份未達 BACKUP_THROTTLE_MS 則略過。
 * - 監聽 visibilitychange，分頁切到背景且有白板時存一次備份。
 * 每次 App 內備份後順便寫一份硬碟備份（主程序節流成約每小時一份，見 platform/backupFile.ts）。
 * 兩者互不影響：硬碟那份失敗只記 log，App 內備份照常。
 */
const backupBoth = (boards: BoardRecord[]) => {
    saveAutoBackup(boards).catch(console.error)
    writeDiskBackup().catch(console.error)
}

export function useAutoBackup(boards: BoardRecord[]) {
    const lastBackupRef = useRef<number>(0)

    const triggerAutoBackup = useCallback((currentBoards: BoardRecord[]) => {
        // 圖片遷移進行中時暫停備份，避免複製「一半 base64、一半 storedName」的肥備份
        if (isImageMigrationRunning()) return
        const now = Date.now()
        if (now - lastBackupRef.current < BACKUP_THROTTLE_MS) return
        lastBackupRef.current = now
        backupBoth(currentBoards)
    }, [])

    useEffect(() => {
        const handler = () => {
            if (isImageMigrationRunning()) return
            if (document.visibilityState === 'hidden' && boards.length > 0) {
                backupBoth(boards)
            }
        }
        document.addEventListener('visibilitychange', handler)
        return () => document.removeEventListener('visibilitychange', handler)
    }, [boards])

    return { triggerAutoBackup }
}
