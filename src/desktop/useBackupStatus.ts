// src/desktop/useBackupStatus.ts
//
// 最新一份硬碟備份的時間。跟摘要一樣先訂閱、再 invoke，兩步之間的更新才不會漏掉。
// 這份不經過主視窗：備份檔是 main process 寫的（desktop:get-backup-status／backup-changed）。

import { useEffect, useState } from 'react'

/** undefined ＝還在讀；null ＝還沒有備份 */
export function useBackupStatus(): number | null | undefined {
    const [latest, setLatest] = useState<number | null | undefined>(undefined)

    useEffect(() => {
        const api = window.desktopAPI
        if (!api) return
        let gotPush = false
        const unsubscribe = api.onBackupChanged(l => { gotPush = true; setLatest(l) })
        api.getBackupStatus().then(s => { if (!gotPush && s) setLatest(s.latest) }).catch(() => {})
        return unsubscribe
    }, [])

    return latest
}
