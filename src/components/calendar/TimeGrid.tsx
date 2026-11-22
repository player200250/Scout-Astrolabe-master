// src/components/calendar/TimeGrid.tsx — 小時檢視與週檢視共用的時間軸
//
// 小時檢視 ＝ 一欄的 TimeGrid，週檢視 ＝ 七欄的 TimeGrid，差別只有 days 的長度。
//
// 時間軸上有兩種東西：白板活動（最後更新的時刻）與排了時段的待辦（2026-11-22，執行閉環 ④）。
// 待辦的到期日沒有時刻，仍進上方全天列；**把全天列的待辦拖到某個小時**就是排時段，
// 已排好的拖到別格是改時段，按 × 取消。拖放用原生 HTML5 DnD，資料放 dataTransfer。
import { useRef, useEffect, useState } from 'react'
import { WEEKDAYS, hourSlot, moveSlot, formatMinutes } from '../../utils/calendarViews'
import type { DayTimeline, TodoRef } from '../../utils/calendarViews'
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
    /** 排／改／取消時段。沒給就不能拖 */
    onScheduleTodo?: (ref: TodoRef, slot: { start: string; end: string } | null) => void
}

/** dataTransfer 的型別鍵：只接自己拖出來的東西，拖檔案或文字進來不理 */
const DRAG_MIME = 'application/x-scout-todo'
type DragPayload = TodoRef & { startMin?: number; endMin?: number }

export function TimeGrid({ days, todayDs, onJumpToBoard, onOpenJournalDay, onPickDay, onScheduleTodo }: TimeGridProps) {
    const scrollRef = useRef<HTMLDivElement | null>(null)
    /** 目前滑過哪一格（ds|hour），畫放置提示 */
    const [dropTarget, setDropTarget] = useState<string | null>(null)

    const dragProps = (payload: DragPayload) => onScheduleTodo ? {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
            const { boardId, shapeId, todoId, startMin, endMin } = payload
            e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ boardId, shapeId, todoId, startMin, endMin }))
            e.dataTransfer.effectAllowed = 'move'
        },
    } : {}

    const dropProps = (ds: string, hour: number) => onScheduleTodo ? {
        onDragOver: (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes(DRAG_MIME)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            const key = `${ds}|${hour}`
            if (dropTarget !== key) setDropTarget(key)
        },
        onDragLeave: () => setDropTarget(t => (t === `${ds}|${hour}` ? null : t)),
        onDrop: (e: React.DragEvent) => {
            setDropTarget(null)
            const raw = e.dataTransfer.getData(DRAG_MIME)
            if (!raw) return
            e.preventDefault()
            try {
                const p = JSON.parse(raw) as DragPayload
                const slot = p.startMin !== undefined && p.endMin !== undefined
                    ? moveSlot(ds, hour, { startMin: p.startMin, endMin: p.endMin })
                    : hourSlot(ds, hour)
                onScheduleTodo({ boardId: p.boardId, shapeId: p.shapeId, todoId: p.todoId }, slot)
            } catch { /* 不是我們的格式 */ }
        },
    } : {}
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = SCROLL_TO_HOUR * HOUR_ROW_H
    }, [])

    // 下面 24 小時那區有捲軸、上面的表頭與全天列沒有 ⇒ 兩邊的欄寬差一條捲軸，欄線對不齊。
    // 量出捲軸寬，補在上面兩列的右邊。
    const [scrollbarW, setScrollbarW] = useState(0)
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        const measure = () => setScrollbarW(el.offsetWidth - el.clientWidth)
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    const cols = `56px repeat(${days.length}, 1fr)`

    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {/* 日期表頭 */}
            <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: `1px solid ${T.borderLight}`, flexShrink: 0, paddingRight: scrollbarW }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: `1px solid ${T.borderLight}`, flexShrink: 0, minHeight: 34, paddingRight: scrollbarW }}>
                <div style={{ fontSize: 10, color: '#bbb', padding: '6px 6px 0 0', textAlign: 'right' }}>全天</div>
                {days.map(d => (
                    <div key={d.ds} style={{ borderLeft: `1px solid ${T.borderLight}`, padding: 4, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        {d.hasJournal && (
                            <div onClick={() => onOpenJournalDay(d.date)} style={{ cursor: 'pointer' }}><JournalChip /></div>
                        )}
                        {d.todos.map(t => (
                            <div key={`${t.shapeId}_${t.todoId}`} {...dragProps(t)} style={{ cursor: onScheduleTodo ? 'grab' : undefined }}
                                title={onScheduleTodo ? '拖到下面的時間排進行程' : undefined}>
                                <TodoChip text={t.text} checked={t.checked} />
                            </div>
                        ))}
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
                            <div key={d.ds} {...dropProps(d.ds, h)} style={{
                                borderTop: `1px solid ${T.borderLight}`, borderLeft: `1px solid ${T.borderLight}`, padding: 2,
                                display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
                                background: dropTarget === `${d.ds}|${h}` ? T.accentBg : undefined,
                            }}>
                                {d.scheduled.filter(s => Math.floor(s.startMin / 60) === h).map(s => (
                                    <div
                                        key={`${s.shapeId}_${s.todoId}`}
                                        {...dragProps(s)}
                                        title={`${formatMinutes(s.startMin)}–${formatMinutes(s.endMin)} ${s.text}`}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            fontSize: 11, lineHeight: '16px', borderRadius: 4, padding: '1px 3px 1px 5px',
                                            cursor: onScheduleTodo ? 'grab' : 'default',
                                            background: s.checked ? T.bgHover : '#fee2e2', color: s.checked ? '#aaa' : '#991b1b',
                                            textDecoration: s.checked ? 'line-through' : 'none',
                                        }}
                                    >
                                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                            {formatMinutes(s.startMin)}–{formatMinutes(s.endMin)} · {s.text || '（無標題）'}
                                        </span>
                                        {onScheduleTodo && (
                                            <button
                                                title="取消排程"
                                                onClick={e => { e.stopPropagation(); onScheduleTodo(s, null) }}
                                                style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: '0 2px', fontSize: 12, lineHeight: 1 }}
                                            >×</button>
                                        )}
                                    </div>
                                ))}
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
