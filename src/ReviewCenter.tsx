// src/ReviewCenter.tsx
import { useState, useEffect } from 'react'
import type { BoardRecord } from './db'
import { CalendarContent } from './CalendarView'
import { JournalDayContent } from './JournalDayView'
import { WeeklyReviewContent } from './WeeklyReview'

type ReviewTab = 'calendar' | 'journal' | 'weekly'

interface ReviewCenterProps {
    boards: BoardRecord[]
    onClose: () => void
    onJumpToBoard: (boardId: string) => void
    onSaveJournal: (boardId: string, dateStr: string, html: string, shapeId: string | null) => void
    onGoToWeeklyCard: () => void
    isDark: boolean
}

const TABS: { key: ReviewTab; label: string }[] = [
    { key: 'calendar', label: '📅 月曆' },
    { key: 'journal',  label: '✍️ 今日日記' },
    { key: 'weekly',   label: '📊 週回顧' },
]

export function ReviewCenter({ boards, onClose, onJumpToBoard, onSaveJournal, onGoToWeeklyCard, isDark }: ReviewCenterProps) {
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

    const outerBg   = isDark ? 'rgba(15,23,42,0.98)' : 'rgba(245,245,243,0.98)'
    const headerBg  = isDark ? 'rgba(30,41,59,0.95)' : 'rgba(255,255,255,0.9)'
    const borderCol = isDark ? '#334155' : '#e8e8e6'
    const titleColor = isDark ? '#e2e8f0' : '#1a1a1a'
    const tabInactiveColor = isDark ? '#94a3b8' : '#666'
    const tabHoverBg = isDark ? '#243447' : '#f0f0ee'
    const btnBorder  = isDark ? '#334155' : '#e0e0de'
    const bodyBg     = isDark ? '#1e293b' : 'white'

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 20000,
            background: outerBg, backdropFilter: 'blur(12px)',
            display: 'flex', flexDirection: 'column',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center',
                padding: '0 20px', height: 52, flexShrink: 0,
                borderBottom: `1px solid ${borderCol}`,
                background: headerBg,
            }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: titleColor, minWidth: 110 }}>📔 復盤中心</span>

                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 3 }}>
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            style={{
                                padding: '5px 18px', borderRadius: 8, border: 'none',
                                background: tab === t.key ? (isDark ? '#2563eb' : '#1a1a1a') : 'transparent',
                                color: tab === t.key ? 'white' : tabInactiveColor,
                                fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
                                cursor: 'pointer', transition: 'background 0.12s',
                            }}
                            onMouseEnter={e => { if (tab !== t.key) e.currentTarget.style.background = tabHoverBg }}
                            onMouseLeave={e => { if (tab !== t.key) e.currentTarget.style.background = 'transparent' }}
                        >{t.label}</button>
                    ))}
                </div>

                <div style={{ minWidth: 110, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        title="關閉 (Esc)"
                        style={{
                            width: 30, height: 30, borderRadius: 8, border: `1px solid ${btnBorder}`,
                            background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#888',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = tabHoverBg)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >✕</button>
                </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: bodyBg }}>
                {tab === 'calendar' && (
                    <CalendarContent
                        boards={boards} isDark={isDark}
                        onJumpToBoard={id => { onClose(); onJumpToBoard(id) }}
                        onOpenJournalDay={handleOpenJournalDay}
                    />
                )}
                {tab === 'journal' && (
                    <JournalDayContent
                        date={journalDate} boards={boards} isDark={isDark}
                        onSaveJournal={onSaveJournal} onDateChange={setJournalDate}
                    />
                )}
                {tab === 'weekly' && (
                    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
                            <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column' }}>
                                <WeeklyReviewContent
                                    boards={boards} isDark={isDark}
                                    onGoToWeeklyCard={() => { onClose(); onGoToWeeklyCard() }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
