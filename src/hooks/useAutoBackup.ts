import { useEffect, useRef, useCallback } from 'react'
import { saveAutoBackup, type BoardRecord } from '../db'
import { BACKUP_THROTTLE_MS } from '../constants'
import { isImageMigrationRunning } from '../utils/migrationState'

/**
 * 自動備份：節流的手動觸發 + 分頁隱藏時自動備份。
 * - triggerAutoBackup(boards)：距上次備份未達 BACKUP_THROTTLE_MS 則略過。
 * - 監聽 visibilitychange，分頁切到背景且有白板時存一次備份。
 */
export function useAutoBackup(boards: BoardRecord[]) {
    const lastBackupRef = useRef<number>(0)

    const triggerAutoBackup = useCallback((currentBoards: BoardRecord[]) => {
        // 圖片遷移進行中時暫停備份，避免複製「一半 base64、一半 storedName」的肥備份
        if (isImageMigrationRunning()) return
        const now = Date.now()
        if (now - lastBackupRef.current < BACKUP_THROTTLE_MS) return
        lastBackupRef.current = now
        saveAutoBackup(currentBoards).catch(console.error)
    }, [])

    useEffect(() => {
        const handler = () => {
            if (isImageMigrationRunning()) return
            if (document.visibilityState === 'hidden' && boards.length > 0) {
                saveAutoBackup(boards).catch(console.error)
            }
        }
        document.addEventListener('visibilitychange', handler)
        return () => document.removeEventListener('visibilitychange', handler)
    }, [boards])

    return { triggerAutoBackup }
}
