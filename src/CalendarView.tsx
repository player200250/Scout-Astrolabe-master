// src/CalendarView.tsx
import { useState, useEffect, useMemo } from 'react'
import React from 'react'
import type { BoardRecord } from './db'
import { toDateStr as dateStr } from './utils/date'
import { getCardShapes } from './utils/snapshot'

/* ------------------------------------------------------------------ utils */
function sameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const WEEKDAY_FULL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

interface DayTodo { text: string; checked: boolean }
interface DayEvents { hasJournal: boolean; todos: DayTodo[] }

function buildMonthEvents(boards: BoardRecord[], year: number, month: number): Map<string, DayEvents> {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
    const map = new Map<string, DayEvents>()
    const get = (ds: string): DayEvents => {
        if (!map.has(ds)) map.set(ds, { hasJournal: false, todos: [] })
        return map.get(ds)!
    }
    for (const board of boards) {
        if (board.isHome) continue
        for (const shape of getCardShapes(board.snapshot)) {
            if (board.isJournal && shape.props.type === 'journal' && shape.props.journalDate?.startsWith(prefix)) {
                get(shape.props.journalDate).hasJournal = true
            }
            if (shape.props.type === 'todo') {
                for (const t of shape.props.todos ?? []) {
                    if (t.dueDate?.startsWith(prefix)) {
                        get(t.dueDate).todos.push({ text: t.text ?? '', checked: !!t.checked })
                    }
                }
            }
        }
    }
    return map
}

interface AgendaData {
    journalCard: { boardId: string; shapeId: string; text: string } | null
    todos: { boardId: string; boardName: string; shapeId: string; todoText: string; checked: boolean; x: number; y: number }[]
    activeBoards: { boardId: string; boardName: string }[]
}

function buildAgenda(boards: BoardRecord[], date: Date): AgendaData {
    const ds = dateStr(date)
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999)
    let journalCard: AgendaData['journalCard'] = null
    const todos: AgendaData['todos'] = []
    const activeBoards: AgendaData['activeBoards'] = []
    for (const board of boards) {
        if (!board.isHome && board.updatedAt >= dayStart.getTime() && board.updatedAt <= dayEnd.getTime()) {
            activeBoards.push({ boardId: board.id, boardName: board.name })
        }
        for (const shape of getCardShapes(board.snapshot)) {
            if (board.isJournal && shape.props.type === 'journal' && shape.props.journalDate === ds && !journalCard) {
                journalCard = { boardId: board.id, shapeId: shape.id, text: shape.props.text ?? '' }
            }
            if (shape.props.type === 'todo') {
                for (const t of shape.props.todos ?? []) {
                    if (t.dueDate === ds) {
                        todos.push({
                            boardId: board.id, boardName: board.name,
                            shapeId: shape.id, todoText: t.text ?? '',
                            checked: !!t.checked, x: shape.x ?? 0, y: shape.y ?? 0,
                        })
                    }
                }
            }
        }
    }
    return { journalCard, todos, activeBoards }
}

/* ------------------------------------------------------------------ CalendarContent */
interface CalendarContentProps {
    boards: BoardRecord[]
    onJumpToBoard: (boardId: string) => void
    onOpenJournalDay: (date: Date) => void
}

export function CalendarContent({ boards, onJumpToBoard, onOpenJournalDay }: CalendarContentProps) {
    const today = new Date()
    const [viewYear, setViewYear] = useState(today.getFullYear())
    const [viewMonth, setViewMonth] = useState(today.getMonth())
    const [selectedDate, setSelectedDate] = useState<Date>(today)

    const monthEvents = useMemo(() => buildMonthEvents(boards, viewYear, viewMonth), [boards, viewYear, viewMonth])
    const agenda = useMemo(() => buildAgenda(boards, selectedDate), [boards, selectedDate])

    const firstDay = new Date(viewYear, viewMonth, 1).getDay()
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
    while (cells.length % 7 !== 0) cells.push(null)

    const prevMonth = () => viewMonth === 0 ? (setViewYear(y => y - 1), setViewMonth(11)) : setViewMonth(m => m - 1)
    const nextMonth = () => viewMonth === 11 ? (setViewYear(y => y + 1), setViewMonth(0)) : setViewMonth(m => m + 1)

    const todayDs = dateStr(today)
    const hasJournal = boards.some(b => b.isJournal)
    const selLabel = `${selectedDate.getMonth() + 1} 月 ${selectedDate.getDate()} 日　${WEEKDAY_FULL[selectedDate.getDay()]}`

    return (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Calendar — 40% */}
            <div style={{ width: '40%', borderRight: '1px solid #e8e8e6', display: 'flex', flexDirection: 'column', background: 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', flexShrink: 0 }}>
                    <button onClick={prevMonth} style={navBtnStyle}>‹</button>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>{viewYear} 年 {viewMonth + 1} 月</span>
                    <button onClick={nextMonth} style={navBtnStyle}>›</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid #f0f0ee', flexShrink: 0 }}>
                    {WEEKDAYS.map((d, i) => (
                        <div key={d} style={{ textAlign: 'center', padding: '4px 0', fontSize: 11, fontWeight: 600, color: i === 0 ? '#e03131' : i === 6 ? '#2563eb' : '#bbb' }}>{d}</div>
                    ))}
                </div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', alignContent: 'start' }}>
                    {cells.map((day, idx) => {
                        if (!day) return <div key={`e${idx}`} style={{ borderBottom: '1px solid #fafaf8', minHeight: 80 }} />
                        const cellDate = new Date(viewYear, viewMonth, day)
                        const ds = dateStr(cellDate)
                        const isToday = ds === todayDs
                        const isSel = sameDay(cellDate, selectedDate)
                        const isSun = cellDate.getDay() === 0
                        const isSat = cellDate.getDay() === 6
                        const ev = monthEvents.get(ds)
                        const todos = ev?.todos ?? []
                        const visibleTodos = todos.slice(0, 3)
                        const extraCount = todos.length - visibleTodos.length
                        return (
                            <div
                                key={ds}
                                onClick={() => setSelectedDate(cellDate)}
                                style={{
                                    minHeight: 80, borderBottom: '1px solid #fafaf8',
                                    display: 'flex', flexDirection: 'column',
                                    padding: 4, gap: 2,
                                    cursor: 'pointer', background: isSel ? '#f0f4ff' : 'transparent',
                                    transition: 'background 0.1s', boxSizing: 'border-box',
                                }}
                                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#f7f7f7' }}
                                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
                            >
                                {/* 日期數字 */}
                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2 }}>
                                    <div style={{
                                        width: 24, height: 24, borderRadius: '50%',
                                        background: isSel ? '#2563eb' : isToday ? '#1a1a1a' : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 12, fontWeight: isSel || isToday ? 700 : 400,
                                        color: isSel || isToday ? 'white' : isSun ? '#e03131' : isSat ? '#2563eb' : '#1a1a1a',
                                    }}>{day}</div>
                                </div>
                                {/* Journal 色條 */}
                                {ev?.hasJournal && (
                                    <div style={{
                                        height: 18, borderRadius: 3, padding: '0 4px',
                                        background: '#fef3c7', color: '#92400e',
                                        fontSize: 10, lineHeight: '18px',
                                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                                        flexShrink: 0,
                                    }}>📔 日記</div>
                                )}
                                {/* Todo 色條 */}
                                {visibleTodos.map((t, i) => (
                                    <div key={i} style={{
                                        height: 18, borderRadius: 3, padding: '0 4px',
                                        background: t.checked ? '#f5f5f5' : '#fee2e2',
                                        color: t.checked ? '#aaa' : '#991b1b',
                                        fontSize: 10, lineHeight: '18px',
                                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                                        textDecoration: t.checked ? 'line-through' : 'none',
                                        flexShrink: 0,
                                    }}>{t.text.slice(0, 12) || '（無標題）'}</div>
                                ))}
                                {/* +N 更多 */}
                                {extraCount > 0 && (
                                    <div style={{ fontSize: 10, color: '#bbb', paddingLeft: 4, lineHeight: '16px' }}>+{extraCount} 更多</div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Agenda — 60% */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 20 }}>{selLabel}</div>
                <Section label="📔 Journal">
                    {agenda.journalCard ? (
                        <AgendaRow onClick={() => onOpenJournalDay(selectedDate)}>
                            <span style={{ flex: 1, fontSize: 13, color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {agenda.journalCard.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || '（空白）'}
                            </span>
                            <Tag>開啟 →</Tag>
                        </AgendaRow>
                    ) : hasJournal ? (
                        <AgendaRow onClick={() => onOpenJournalDay(selectedDate)} muted>
                            <span style={{ fontSize: 13, color: '#aaa' }}>尚無日記，點擊建立</span>
                            <Tag>建立 →</Tag>
                        </AgendaRow>
                    ) : (
                        <EmptyNote>尚未設定 Journal 白板</EmptyNote>
                    )}
                </Section>
                <Section label="✅ 待辦到期">
                    {agenda.todos.length === 0 ? <EmptyNote>無到期待辦</EmptyNote> : agenda.todos.map((t, i) => (
                        <AgendaRow key={i} onClick={() => onJumpToBoard(t.boardId)}>
                            <span style={{ fontSize: 11, marginTop: 1, color: t.checked ? '#bbb' : '#d0d0d0', flexShrink: 0 }}>{t.checked ? '☑' : '☐'}</span>
                            <span style={{ flex: 1, fontSize: 13, color: t.checked ? '#aaa' : '#1a1a1a', textDecoration: t.checked ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.todoText}</span>
                            <span style={{ fontSize: 11, color: '#bbb', flexShrink: 0 }}>{t.boardName}</span>
                        </AgendaRow>
                    ))}
                </Section>
                <Section label="📋 白板活動">
                    {agenda.activeBoards.length === 0 ? <EmptyNote>無白板活動</EmptyNote> : agenda.activeBoards.map(b => (
                        <AgendaRow key={b.boardId} onClick={() => onJumpToBoard(b.boardId)}>
                            <span style={{ flex: 1, fontSize: 13, color: '#1a1a1a' }}>{b.boardName}</span>
                            <Tag>前往 →</Tag>
                        </AgendaRow>
                    ))}
                </Section>
            </div>
        </div>
    )
}

/* ------------------------------------------------------------------ CalendarView (standalone full-screen) */
interface CalendarViewProps {
    boards: BoardRecord[]
    onClose: () => void
    onJumpToBoard: (boardId: string) => void
    onOpenJournalDay: (date: Date) => void
}

export function CalendarView({ boards, onClose, onJumpToBoard, onOpenJournalDay }: CalendarViewProps) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [onClose])

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(245,245,243,0.97)', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '14px 24px', borderBottom: '1px solid #e8e8e6', background: 'rgba(255,255,255,0.85)', flexShrink: 0, gap: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>🗓️ 月曆</span>
                <div style={{ flex: 1 }} />
                <button onClick={onClose} style={closeBtnStyle}>✕</button>
            </div>
            <CalendarContent
                boards={boards}
                onJumpToBoard={id => { onJumpToBoard(id); onClose() }}
                onOpenJournalDay={date => { onOpenJournalDay(date); onClose() }}
            />
        </div>
    )
}

/* ------------------------------------------------------------------ sub-components */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
            <div>{children}</div>
        </div>
    )
}

function AgendaRow({ onClick, children, muted }: { onClick: () => void; children: React.ReactNode; muted?: boolean }) {
    return (
        <div
            onClick={onClick}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', cursor: 'pointer', borderBottom: '1px solid #f5f5f3', opacity: muted ? 0.7 : 1 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
            onMouseLeave={e => (e.currentTarget.style.opacity = muted ? '0.7' : '1')}
        >{children}</div>
    )
}

function Tag({ children }: { children: React.ReactNode }) {
    return <span style={{ fontSize: 10, fontWeight: 600, color: '#2563eb', background: '#eff6ff', borderRadius: 5, padding: '2px 6px', flexShrink: 0, whiteSpace: 'nowrap' }}>{children}</span>
}

function EmptyNote({ children }: { children: React.ReactNode }) {
    return <div style={{ fontSize: 12, color: '#ccc', padding: '6px 0' }}>{children}</div>
}

/* ------------------------------------------------------------------ styles */
const closeBtnStyle: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 8, border: '1px solid #e0e0de',
    background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#888',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
}

const navBtnStyle: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 8, border: '1px solid #e8e8e8',
    background: 'transparent', cursor: 'pointer', fontSize: 17, color: '#888',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
}
