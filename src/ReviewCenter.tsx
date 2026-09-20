// src/ReviewCenter.tsx
import { useState, useEffect } from 'react'
import type { BoardRecord } from './db'
import { CalendarContent } from './CalendarView'
import { JournalDayContent } from './JournalDayView'
import { WeeklyReviewContent } from './WeeklyReview'
import { T } from './theme/tokens'
import { FullscreenPanel } from './components/ui/FullscreenPanel'
import { Icon } from './components/ui/icons'
import type { IconName } from './components/ui/icons'

export type ReviewTab = 'calendar' | 'journal' | 'weekly'

interface ReviewCenterProps {
    boards: BoardRecord[]
    onClose: () => void
    onJumpToBoard: (boardId: string) => void
    onSaveJournal: (boardId: string, dateStr: string, html: string, shapeId: string | null) => void
    onGoToWeeklyCard: () => void
    /**
     * 開啟時停在哪個分頁，預設月曆。
     * 儀表板的「開啟今日日記 →」要落在日記頁——按鈕名稱承諾了目的地就得兌現。
     */
    initialTab?: ReviewTab
}

// 圖示一律走 lucide 線性圖示（與側邊欄同一套）。
// 復盤中心是 emoji→線性圖示那一輪（commit 0e308f1）漏掉的最後一處，2026-09-20 補上。
const TABS: { key: ReviewTab; label: string; icon: IconName }[] = [
    { key: 'calendar', label: '月曆',     icon: 'calendar' },
    { key: 'journal',  label: '今日日記', icon: 'cardJournal' },
    { key: 'weekly',   label: '週回顧',   icon: 'stats' },
]

export function ReviewCenter({ boards, onClose, onJumpToBoard, onSaveJournal, onGoToWeeklyCard, initialTab = 'calendar' }: ReviewCenterProps) {
    const [tab, setTab] = useState<ReviewTab>(initialTab)
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
            title="復盤中心"
            titleIcon="reviewCenter"
            onClose={onClose}
            padded={false}
            headerContent={(
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 3 }}>
                        {TABS.map(t => (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '5px 18px', borderRadius: 8, border: 'none',
                                    background: tab === t.key ? (T.bgActive) : 'transparent',
                                    color: tab === t.key ? 'white' : tabInactiveColor,
                                    fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
                                    cursor: 'pointer', transition: 'background 0.12s',
                                }}
                                onMouseEnter={e => { if (tab !== t.key) e.currentTarget.style.background = tabHoverBg }}
                                onMouseLeave={e => { if (tab !== t.key) e.currentTarget.style.background = 'transparent' }}
                            ><Icon name={t.icon} />{t.label}</button>
                        ))}
                    </div>
            )}
        >
            {/* Body */}
            {/* RC1：父層（FullscreenPanel 的內容格）是 block，flex:1 在這裡不生效，
                body 的高度會被內容撐開 ⇒ 真正在捲的變成面板最外層，日期列與工具列跟著捲走。
                height:100% 把父層那格的固定高度接下來，minHeight:0 讓子項可以縮。 */}
            <div style={{ flex: 1, height: '100%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: bodyBg }}>
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
                {/* RC2：原本包了一層 maxWidth:440 的居中窄欄，1920 寬的視窗下兩側全是空白，
                    而且看不到週回顧卡的內容。改由 WeeklyReviewContent 自己排左統計／右內文兩欄。 */}
                {tab === 'weekly' && (
                    <WeeklyReviewContent
                        boards={boards}
                        onGoToWeeklyCard={() => { onClose(); onGoToWeeklyCard() }}
                        onSaveJournal={onSaveJournal}
                    />
                )}
            </div>
        </FullscreenPanel>
    )
}
