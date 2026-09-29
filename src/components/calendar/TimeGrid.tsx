// src/components/calendar/TimeGrid.tsx — 小時檢視與週檢視共用的時間軸
//
// 小時檢視 ＝ 一欄的 TimeGrid，週檢視 ＝ 七欄的 TimeGrid，差別只有 days 的長度。
//
// ⚠️ 時間軸上目前只放得了「白板活動」：待辦只有 dueDate（無時刻）、日記是整天的，
//    它們一律進上方的全天列（Google 對無時間事件也是這樣）。
//    等待辦有了時刻，只要 buildDayTimeline 把它放進 timed，這裡不用改。
import { useRef, useEffect } from 'react'
import { WEEKDAYS } from '../../utils/calendarViews'
import type { DayTimeline } from '../../utils/calendarViews'
import { JournalChip, TodoChip } from './primitives'
import { T } from '../../theme/tokens'

/** 每小時的列高 */
const HOUR_ROW_H = 44
/** 預設捲到早上 7 點，不然一打開只看得到空的半夜 */
const SCROLL_TO_HOUR = 7

interface TimeGridProps {
    days: DayTimeline[]
    todayDs: string
    onJumpToBoard: (boardId: string) => void
    onOpenJournalDay: (date: Date) => void
    onPickDay: (date: Date) => void
}

export function TimeGrid({ days, todayDs, onJumpToBoard, onOpenJournalDay, onPickDay }: TimeGridProps) {
    const scrollRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = SCROLL_TO_HOUR * HOUR_ROW_H
    }, [])

    const cols = `56px repeat(${days.length}, 1fr)`

    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {/* 日期表頭 */}
            <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: `1px solid ${T.borderLight}`, flexShrink: 0 }}>
                <div />
                {days.map(d => {
                    const isToday = d.ds === todayDs
                    return (
                        <div
                            key={d.ds}
                            onClick={() => onPickDay(d.date)}
                            style={{ textAlign: 'center', padding: '6px 0', cursor: 'pointer', borderLeft: `1px solid ${T.borderLight}` }}
                        >
                            <div style={{ fontSize: 11, color: '#bbb' }}>{WEEKDAYS[d.date.getDay()]}</div>
                            <div style={{
                                margin: '2px auto 0', width: 24, height: 24, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 12, fontWeight: isToday ? 700 : 400,
                                background: isToday ? T.bgActive : 'transparent',
                                color: isToday ? 'white' : T.textPrimary,
                            }}>{d.date.getDate()}</div>
                        </div>
                    )
                })}
            </div>

            {/* 全天列 */}
            <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: `1px solid ${T.borderLight}`, flexShrink: 0, minHeight: 34 }}>
                <div style={{ fontSize: 10, color: '#bbb', padding: '6px 6px 0 0', textAlign: 'right' }}>全天</div>
                {days.map(d => (
                    <div key={d.ds} style={{ borderLeft: `1px solid ${T.borderLight}`, padding: 4, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        {d.hasJournal && (
                            <div onClick={() => onOpenJournalDay(d.date)} style={{ cursor: 'pointer' }}><JournalChip /></div>
                        )}
                        {d.todos.map((t, i) => <TodoChip key={i} text={t.text} checked={t.checked} />)}
                    </div>
                ))}
            </div>

            {/* 24 小時 */}
            <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} style={{ display: 'grid', gridTemplateColumns: cols, minHeight: HOUR_ROW_H }}>
                        <div style={{ fontSize: 10, color: '#bbb', textAlign: 'right', padding: '2px 6px 0 0', borderTop: `1px solid ${T.borderLight}` }}>
                            {String(h).padStart(2, '0')}:00
                        </div>
                        {days.map(d => (
                            <div key={d.ds} style={{ borderTop: `1px solid ${T.borderLight}`, borderLeft: `1px solid ${T.borderLight}`, padding: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                                {d.timed.filter(a => a.hour === h).map(a => (
                                    <div
                                        key={a.boardId}
                                        onClick={() => onJumpToBoard(a.boardId)}
                                        title={`${a.boardName} — ${String(a.hour).padStart(2, '0')}:${String(a.minute).padStart(2, '0')} 更新`}
                                        style={{
                                            fontSize: 11, lineHeight: '16px', borderRadius: 4, padding: '1px 5px', cursor: 'pointer',
                                            background: '#e0e7ff', color: '#3730a3',
                                            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {/* RC5：只印分鐘的話，14:00 那列的「15 · 日誌」會被讀成 15 點。
                                            小時本來靠「排在第幾列」表達，但多筆堆在同一格時那個線索就不夠了。 */}
                                        {String(a.hour).padStart(2, '0')}:{String(a.minute).padStart(2, '0')} · {a.boardName}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    )
}
