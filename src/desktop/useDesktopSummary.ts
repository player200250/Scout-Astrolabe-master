// src/desktop/useDesktopSummary.ts
//
// 先訂閱 summary-changed、再 invoke get-summary：反過來的話，兩步之間送來的更新會漏掉。
// null ＝主視窗還沒就緒（或已關閉／重載中）→ 畫面顯示「等待 Scout…」。

import { useEffect, useState } from 'react'
import type { DesktopCommand, DesktopCommandResult, DesktopSummary } from '../utils/desktopSummary'

export function useDesktopSummary(): DesktopSummary | null {
    const [summary, setSummary] = useState<DesktopSummary | null>(null)

    useEffect(() => {
        const api = window.desktopAPI
        if (!api) return
        let gotPush = false
        const unsubscribe = api.onSummaryChanged(s => { gotPush = true; setSummary(s) })
        api.getSummary().then(s => { if (!gotPush) setSummary(s) }).catch(() => {})
        return unsubscribe
    }, [])

    return summary
}

export function sendDesktopCommand(cmd: DesktopCommand): Promise<DesktopCommandResult> {
    const api = window.desktopAPI
    if (!api) return Promise.resolve({ ok: false, reason: 'not-ready' })
    return api.sendCommand(cmd).catch(() => ({ ok: false, reason: 'not-ready' }) as const)
}
