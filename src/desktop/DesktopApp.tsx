// src/desktop/DesktopApp.tsx
//
// 卡片格（外觀規格：docs/adr/0009-scout-desktop-scope.md 附錄）。
// 卡片固定寫死在 renderCard，不做 widget registry——數量少，registry 只會多一層要維護的東西。
// 使用者能改的只有「怎麼排」：順序與隱藏（src/utils/desktopLayout.ts），✎ 排列進入編輯。

import { useEffect, useRef, useState } from 'react'
import { toDateStr } from '../utils/date'
import {
    visibleDesktopCards, desktopRowCount, desktopNeighbor, moveDesktopCard, swapDesktopCards,
    hideDesktopCard, showDesktopCard, canHideDesktopCard, canShowDesktopCard, defaultDesktopLayout,
    DESKTOP_COLUMNS, type DesktopCardId,
} from '../utils/desktopLayout'
import type { DesktopSummary } from '../utils/desktopSummary'
import { useDesktopSummary, sendDesktopCommand } from './useDesktopSummary'
import { useDesktopTheme } from './useDesktopTheme'
import { useDesktopLayout } from './useDesktopLayout'
import { CardSlot } from './CardSlot'
import { DESKTOP_CARD_NAMES } from './cardNames'
import { ClockCard } from './ClockCard'
import { TasksCard } from './TasksCard'
import { RecentBoardsCard } from './RecentBoardsCard'
import { QuickNoteCard } from './QuickNoteCard'
import { UpcomingCard } from './UpcomingCard'
import { BackupCard } from './BackupCard'
import { useBackupStatus } from './useBackupStatus'
import { SearchBox } from './SearchBox'

function renderCard(id: DesktopCardId, now: Date, summary: DesktopSummary | null, backupAt: number | null | undefined) {
    switch (id) {
        case 'clock': return <ClockCard now={now} summary={summary} />
        case 'tasks': return <TasksCard summary={summary} />
        case 'recent-boards': return <RecentBoardsCard summary={summary} />
        case 'quick-note': return <QuickNoteCard connected={summary !== null} inboxCount={summary?.inbox.count ?? 0} />
        case 'upcoming': return <UpcomingCard summary={summary} />
        case 'backup': return <BackupCard now={now} latest={backupAt} connected={summary !== null} />
    }
}

export function DesktopApp() {
    useDesktopTheme()
    const summary = useDesktopSummary()
    const backupAt = useBackupStatus()
    const [layout, setLayout] = useDesktopLayout()
    const [editing, setEditing] = useState(false)
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

    // Esc 離開排列模式
    useEffect(() => {
        if (!editing) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditing(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [editing])

    const visible = layout ? visibleDesktopCards(layout) : []
    const rows = desktopRowCount(visible.length)
    const spanningLast = visible.length % DESKTOP_COLUMNS === 1

    return (
        <div className="dt-shell">
            <header className="dt-titlebar">
                <span className="dt-titlebar-name">{editing ? '排列卡片' : 'Scout Desktop'}</span>
                {!editing && <SearchBox connected={summary !== null} />}
                <div className="dt-titlebar-actions">
                    {editing ? (
                        <>
                            <button className="dt-titlebar-btn" onClick={() => setLayout(defaultDesktopLayout())}>恢復預設</button>
                            <button className="dt-titlebar-btn dt-titlebar-btn-primary" onClick={() => setEditing(false)}>完成</button>
                        </>
                    ) : (
                        <button className="dt-titlebar-btn" onClick={() => setEditing(true)} disabled={!layout} title="調整卡片位置、隱藏不需要的卡">✎ 排列</button>
                    )}
                    <button className="dt-close" onClick={() => window.close()} aria-label="關閉" title="關閉（可從系統匣再開）">✕</button>
                </div>
            </header>
            <main className="dt-grid" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
                {layout && visible.map((id, i) => (
                    <CardSlot
                        key={id}
                        id={id}
                        editing={editing}
                        spanRow={spanningLast && i === visible.length - 1}
                        canMove={dir => desktopNeighbor(visible, id, dir) !== null}
                        canHide={canHideDesktopCard(layout, id)}
                        onMove={dir => setLayout(moveDesktopCard(layout, id, dir))}
                        onSwap={other => setLayout(swapDesktopCards(layout, other, id))}
                        onHide={() => setLayout(hideDesktopCard(layout, id))}
                    >
                        {renderCard(id, now, summary, backupAt)}
                    </CardSlot>
                ))}
            </main>
            {editing && layout && (
                <footer className="dt-hidden-bar">
                    {layout.hidden.length === 0 ? (
                        <span className="dt-hint">所有卡片都在畫面上</span>
                    ) : (
                        <>
                            <span className="dt-hint">已隱藏：</span>
                            {layout.hidden.map(id => (
                                <button
                                    key={id}
                                    className="dt-button"
                                    disabled={!canShowDesktopCard(layout)}
                                    onClick={() => setLayout(showDesktopCard(layout, id))}
                                >+ {DESKTOP_CARD_NAMES[id]}</button>
                            ))}
                        </>
                    )}
                </footer>
            )}
        </div>
    )
}
