// src/CalendarView.tsx — 復盤中心的月曆分頁（組裝層）
//
// 2026-09-20：加上多種檢視（參考 Google Calendar）。
// 2026-09-29：收成「日／週／月／年」四種——原本的「小時」與「日」都是看一天，
// 而「日」那份議程清單以 Journal 開頭，等於把日記放在日曆正中央。
// 這一檔只負責「目前在看哪一段時間、哪個檢視」與把資料餵給檢視元件，
// 版面實作各自住在 components/calendar/：
//
//   MonthGrid    月檢視（格子）
//   TimeGrid     日／週檢視（全天列 ＋ 24 小時軸）
//   YearGrid     年檢視（12 個月密度圖）
//   AgendaPanel  右側 380px 當日議程（日記入口在這裡）
//   primitives   共用 chip／Section／Row
//
// 資料層（純函式、可單測）在 utils/calendarEvents.ts 與 utils/calendarViews.ts，
// 後者開頭寫了「待辦沒有時刻」這個前提，看時間軸相關的東西前先讀它。
import { useState, useMemo } from 'react'
import React from 'react'
import type { BoardRecord } from './db'
import { toDateStr as dateStr } from './utils/date'
import { buildMonthEvents, buildAgenda } from './utils/calendarEvents'
import {
    VIEW_MODES, buildDayTimeline, buildWeekTimelines, buildYearDensity,
    shiftViewDate, viewRangeLabel,
} from './utils/calendarViews'
import type { CalendarViewMode } from './utils/calendarViews'
import { MonthGrid } from './components/calendar/MonthGrid'
import { TimeGrid } from './components/calendar/TimeGrid'
import { YearGrid } from './components/calendar/YearGrid'
import { AgendaPanel } from './components/calendar/AgendaPanel'
import { T } from './theme/tokens'

interface CalendarContentProps {
    boards: BoardRecord[]
    onJumpToBoard: (boardId: string) => void
    onOpenJournalDay: (date: Date) => void
}

export function CalendarContent({ boards, onJumpToBoard, onOpenJournalDay }: CalendarContentProps) {
    const today = new Date()
    const [view, setView] = useState<CalendarViewMode>('month')
    /** 錨點：月檢視看它的年月、週檢視看它所在的週、日檢視就是那一天 */
    const [cursor, setCursor] = useState<Date>(today)
    const [selectedDate, setSelectedDate] = useState<Date>(today)

    const viewYear  = cursor.getFullYear()
    const viewMonth = cursor.getMonth()

    const monthEvents = useMemo(() => (view === 'month' ? buildMonthEvents(boards, viewYear, viewMonth) : new Map()), [boards, viewYear, viewMonth, view])
    const agenda      = useMemo(() => buildAgenda(boards, selectedDate), [boards, selectedDate])
    const dayTimeline = useMemo(() => buildDayTimeline(boards, cursor), [boards, cursor])
    const weekDays    = useMemo(() => (view === 'week' ? buildWeekTimelines(boards, cursor) : []), [boards, cursor, view])
    const yearDensity = useMemo(() => (view === 'year' ? buildYearDensity(boards, viewYear) : new Map<string, number>()), [boards, viewYear, view])

    const todayDs = dateStr(today)
    const hasJournalBoard = boards.some(b => b.isJournal)

    const navBtnStyle: React.CSSProperties = {
        width: 28, height: 28, borderRadius: 8, border: `1px solid ${T.borderLight}`,
        background: 'transparent', cursor: 'pointer', fontSize: 17, color: '#888',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    }

    /** 點某一天：選起來；drillDown 時順便鑽進日檢視 */
    const pickDay = (d: Date, drillDown = false) => {
        setSelectedDate(d)
        if (drillDown) { setCursor(d); setView('day') }
    }

    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
            <div style={{
                flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
                borderRight: `1px solid ${T.borderLight}`, background: T.bgPanel,
            }}>
                {/* 期間導覽 ＋ 檢視切換 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', flexShrink: 0, borderBottom: `1px solid ${T.borderLight}` }}>
                    <button onClick={() => setCursor(c => shiftViewDate(view, c, -1))} style={navBtnStyle} title="上一頁">‹</button>
                    <button onClick={() => setCursor(c => shiftViewDate(view, c, 1))} style={navBtnStyle} title="下一頁">›</button>
                    <button
                        onClick={() => { setCursor(today); setSelectedDate(today) }}
                        style={{ padding: '4px 12px', borderRadius: 8, border: `1px solid ${T.borderLight}`, background: 'transparent', cursor: 'pointer', fontSize: 12, color: T.textSecondary, fontWeight: 500 }}
                        title="回到今天"
                    >今天</button>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, marginLeft: 6 }}>{viewRangeLabel(view, cursor)}</span>

                    <div style={{ flex: 1 }} />

                    <div style={{ display: 'flex', gap: 2, background: T.bgApp, borderRadius: 9, padding: 2 }}>
                        {VIEW_MODES.map(m => (
                            <button
                                key={m.key}
                                onClick={() => setView(m.key)}
                                style={{
                                    padding: '4px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                                    fontSize: 12, fontWeight: view === m.key ? 600 : 400,
                                    background: view === m.key ? T.bgActive : 'transparent',
                                    color: view === m.key ? 'white' : T.textSecondary,
                                }}
                            >{m.label}</button>
                        ))}
                    </div>
                </div>

                {view === 'month' && (
                    <MonthGrid
                        year={viewYear} month={viewMonth} events={monthEvents}
                        todayDs={todayDs} selectedDs={dateStr(selectedDate)}
                        onPickDay={pickDay}
                    />
                )}

                {(view === 'day' || view === 'week') && (
                    <TimeGrid
                        days={view === 'day' ? [dayTimeline] : weekDays}
                        todayDs={todayDs}
                        onJumpToBoard={onJumpToBoard}
                        onOpenJournalDay={onOpenJournalDay}
                        onPickDay={d => pickDay(d)}
                    />
                )}

                {view === 'year' && (
                    <YearGrid
                        year={viewYear} density={yearDensity}
                        todayDs={todayDs} selectedDs={dateStr(selectedDate)}
                        onPickDay={d => pickDay(d)}
                        onOpenMonth={m => { setCursor(new Date(viewYear, m, 1)); setView('month') }}
                    />
                )}
            </div>

            {/* 右欄是日記在月曆分頁裡唯一的入口（另一個是復盤中心的「今日日記」分頁）。
                主區域四種檢視都只畫時間，不再夾帶議程，所以這裡不必再依檢視開關。 */}
            <AgendaPanel
                date={selectedDate}
                agenda={agenda}
                hasJournalBoard={hasJournalBoard}
                onJumpToBoard={onJumpToBoard}
                onOpenJournalDay={onOpenJournalDay}
            />
        </div>
    )
}
