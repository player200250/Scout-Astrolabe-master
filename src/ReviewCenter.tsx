// src/ReviewCenter.tsx
import { useState, useEffect } from 'react'
import type { BoardRecord } from './db'
import { CalendarContent } from './CalendarView'
import { JournalDayContent } from './JournalDayView'
import { WeeklyReviewContent } from './WeeklyReview'
import { T } from './theme/tokens'
import { FullscreenPanel } from './components/ui/FullscreenPanel'

type ReviewTab = 'calendar' | 'journal' | 'weekly'

interface ReviewCenterProps {
    boards: BoardRecord[]
    onClose: () => void
    onJumpToBoard: (boardId: string) => void
    onSaveJournal: (boardId: string, dateStr: string, html: string, shapeId: string | null) => void
    onGoToWeeklyCard: () => void
}

const TABS: { key: ReviewTab; label: string }[] = [
    { key: 'calendar', label: '📅 月曆' },
    { key: 'journal',  label: '✍️ 今日日記' },
    { key: 'weekly',   label: '📊 週回顧' },
]

export function ReviewCenter({ boards, onClose, onJumpToBoard, onSaveJournal, onGoToWeeklyCard }: ReviewCenterProps) {
    const [tab, setTab] = useState<ReviewTab>('calendar')
    const [journalDate, setJournalDate] = useState<Date>(new Date())

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [onClose])

    const handleOpenJournalDay = (date: Date) => {
        setJournalDate(date)
        setTab('journal')
    }

    // 外框、標題列、關閉鈕由 FullscreenPanel 提供；這裡只剩分頁列與內容區的顏色
    const tabInactiveColor = T.textSecondary
    const tabHoverBg = T.bgApp
    const bodyBg     = T.bgPanel

    return (
        <FullscreenPanel
            title="📔 復盤中心"
            onClose={onClose}
            padded={false}
            headerContent={(
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 3 }}>
                        {TABS.map(t => (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key)}
                                style={{
                                    padding: '5px 18px', borderRadius: 8, border: 'none',
                                    background: tab === t.key ? (T.bgActive) : 'transparent',
                                    color: tab === t.key ? 'white' : tabInactiveColor,
                                    fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
                                    cursor: 'pointer', transition: 'background 0.12s',
                                }}
                                onMouseEnter={e => { if (tab !== t.key) e.currentTarget.style.background = tabHoverBg }}
                                onMouseLeave={e => { if (tab !== t.key) e.currentTarget.style.background = 'transparent' }}
                            >{t.label}</button>
                        ))}
                    </div>
            )}
        >
            {/* Body */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: bodyBg }}>
                {tab === 'calendar' && (
                    <CalendarContent
                        boards={boards}
                        onJumpToBoard={id => { onClose(); onJumpToBoard(id) }}
                        onOpenJournalDay={handleOpenJournalDay}
                    />
                )}
                {tab === 'journal' && (
                    <JournalDayContent
                        date={journalDate} boards={boards}
                        onSaveJournal={onSaveJournal} onDateChange={setJournalDate}
                    />
                )}
                {tab === 'weekly' && (
                    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
                            <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column' }}>
                                <WeeklyReviewContent
                                    boards={boards}
                                    onGoToWeeklyCard={() => { onClose(); onGoToWeeklyCard() }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </FullscreenPanel>
    )
}
