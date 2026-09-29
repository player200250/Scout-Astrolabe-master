// src/components/calendar/MonthGrid.tsx — 月檢視（原本就有的那一個）
import { toDateStr as dateStr } from '../../utils/date'
import type { DayEvents } from '../../utils/calendarEvents'
import { JournalChip, TodoChip, MoreDots } from './primitives'
import { WEEKDAYS } from '../../utils/calendarViews'
import { T } from '../../theme/tokens'

/** 每格直接顯示標題的待辦數；超過的用密度點（RC3，2026-09-20） */
const MAX_CELL_TODOS = 2
/** 密度點最多畫幾顆，再多只看數字 */
const MAX_CELL_DOTS = 5

interface MonthGridProps {
    year: number
    month: number
    events: Map<string, DayEvents>
    todayDs: string
    selectedDs: string
    /** 點一下＝選取；雙擊＝鑽進日檢視 */
    onPickDay: (date: Date, drillDown?: boolean) => void
}

export function MonthGrid({ year, month, events, todayDs, selectedDs, onPickDay }: MonthGridProps) {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
    while (cells.length % 7 !== 0) cells.push(null)

    return (
        <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: `1px solid ${T.borderLight}`, flexShrink: 0 }}>
                {WEEKDAYS.map((d, i) => (
                    <div key={d} style={{ textAlign: 'center', padding: '4px 0', fontSize: 11, fontWeight: 600, color: i === 0 ? '#e03131' : i === 6 ? '#2563eb' : '#bbb' }}>{d}</div>
                ))}
            </div>

            {/* 列高 minmax(80px, 1fr)：排數少時撐滿，排數多時保有 80px 最小值並可捲動。
                欄寬用 minmax(0, 1fr) 而非 1fr：1fr 的自動最小值是內容寬，長待辦（nowrap）
                會把該欄撐開、擠壞其餘六欄並讓表頭對不齊，chip 的省略號也就永遠輪不到。 */}
            <div style={{
                flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridAutoRows: 'minmax(80px, 1fr)',
            }}>
                {cells.map((day, idx) => {
                    if (!day) return <div key={`e${idx}`} style={{ borderBottom: `1px solid ${T.borderLight}`, minHeight: 80, minWidth: 0 }} />
                    const cellDate = new Date(year, month, day)
                    const ds = dateStr(cellDate)
                    const isToday = ds === todayDs
                    const isSel   = ds === selectedDs
                    const isSun   = cellDate.getDay() === 0
                    const isSat   = cellDate.getDay() === 6
                    const ev = events.get(ds)
                    const todos = ev?.todos ?? []
                    return (
                        <div
                            key={ds}
                            onClick={() => onPickDay(cellDate)}
                            onDoubleClick={() => onPickDay(cellDate, true)}
                            title="點一下選取，雙擊進入日檢視"
                            style={{
                                minHeight: 80, minWidth: 0, borderBottom: `1px solid ${T.borderLight}`,
                                display: 'flex', flexDirection: 'column', padding: 4, gap: 2,
                                cursor: 'pointer', background: isSel ? T.accentBg : 'transparent',
                                transition: 'background 0.1s', boxSizing: 'border-box',
                            }}
                            onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = T.bgHover }}
                            onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
                        >
                            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginBottom: 2 }}>
                                <div style={{
                                    width: 24, height: 24, borderRadius: '50%',
                                    background: isSel ? '#2563eb' : isToday ? T.bgActive : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 12, fontWeight: isSel || isToday ? 700 : 400,
                                    color: isSel || isToday ? 'white' : isSun ? '#e03131' : isSat ? '#2563eb' : T.textPrimary,
                                }}>{day}</div>
                                {/* 白板活動用小圓點而非 chip：日記與待辦已經各佔一行，再加一條會把格子撐爆 */}
                                {(ev?.boardActivity ?? 0) > 0 && (
                                    <span
                                        title={`${ev!.boardActivity} 塊白板在這天更新`}
                                        style={{ position: 'absolute', top: 1, left: 'calc(50% + 11px)', width: 5, height: 5, borderRadius: '50%', background: '#818cf8' }}
                                    />
                                )}
                            </div>
                            {ev?.hasJournal && <JournalChip />}
                            {todos.slice(0, MAX_CELL_TODOS).map((t, i) => <TodoChip key={i} text={t.text} checked={t.checked} />)}
                            <MoreDots items={todos.slice(MAX_CELL_TODOS)} maxDots={MAX_CELL_DOTS} />
                        </div>
                    )
                })}
            </div>
        </>
    )
}
