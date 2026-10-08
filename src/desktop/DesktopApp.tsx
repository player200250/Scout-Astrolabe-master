// src/desktop/DesktopApp.tsx
//
// 2×2 四張卡（外觀規格：docs/adr/0009-scout-desktop-scope.md 附錄）。
// 四張卡固定寫死，不做 widget registry——數量少，registry 只會多一層要維護的東西。

import { useEffect, useRef, useState } from 'react'
import { toDateStr } from '../utils/date'
import { useDesktopSummary, sendDesktopCommand } from './useDesktopSummary'
import { useDesktopTheme } from './useDesktopTheme'
import { ClockCard } from './ClockCard'
import { TasksCard } from './TasksCard'
import { RecentBoardsCard } from './RecentBoardsCard'
import { QuickNoteCard } from './QuickNoteCard'

export function DesktopApp() {
    useDesktopTheme()
    const summary = useDesktopSummary()
    const [now, setNow] = useState(() => new Date())

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 10_000)
        return () => clearInterval(id)
    }, [])

    // 跨過午夜：摘要還是主視窗昨天算的 ⇒ 請它用新的日期重算（每個新日期只請一次）
    const todayStr = toDateStr(now)
    const refreshedFor = useRef<string | null>(null)
    useEffect(() => {
        if (!summary || summary.today === todayStr || refreshedFor.current === todayStr) return
        refreshedFor.current = todayStr
        void sendDesktopCommand({ type: 'refresh' })
    }, [summary, todayStr])

    return (
        <div className="dt-shell">
            <header className="dt-titlebar">
                <span className="dt-titlebar-name">Scout Desktop</span>
                <button className="dt-close" onClick={() => window.close()} aria-label="關閉" title="關閉（可從系統匣再開）">✕</button>
            </header>
            <main className="dt-grid">
                <ClockCard now={now} summary={summary} />
                <TasksCard summary={summary} />
                <RecentBoardsCard summary={summary} />
                <QuickNoteCard connected={summary !== null} />
            </main>
        </div>
    )
}
