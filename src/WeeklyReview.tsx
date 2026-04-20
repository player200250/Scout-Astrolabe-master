// src/WeeklyReview.tsx
import { useMemo } from 'react'
import type { BoardRecord } from './db'
import { getCardShapes } from './utils/snapshot'

/* ------------------------------------------------------------------ ISO week helpers */
export function getISOWeekKey(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
    return `week-${d.getUTCFullYear()}-${String(weekNum).padStart(2, '0')}`
}

export function getWeekRange(date: Date): { start: Date; end: Date; weekNum: number } {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    const day = d.getDay() || 7
    const monday = new Date(d)
    monday.setDate(d.getDate() - (day - 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    const thu = new Date(monday)
    thu.setDate(monday.getDate() + 3)
    const yearStart = new Date(thu.getFullYear(), 0, 1)
    const weekNum = Math.ceil(((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    return { start: monday, end: sunday, weekNum }
}

/* ------------------------------------------------------------------ Stats */
interface WeekStats {
    cardsByBoard: { boardName: string; count: number }[]
    totalCards: number
    completedTodos: number
    wikiLinks: number
}

function computeWeekStats(boards: BoardRecord[], weekStart: Date, weekEnd: Date): WeekStats {
    const cardsByBoard: { boardName: string; count: number }[] = []
    let completedTodos = 0
    let wikiLinks = 0

    for (const board of boards) {
        if (board.updatedAt < weekStart.getTime() || board.updatedAt > weekEnd.getTime()) continue
        const shapes = getCardShapes(board.snapshot)
        if (shapes.length === 0) continue
        for (const shape of shapes) {
            if (shape.props.type === 'todo') {
                completedTodos += (shape.props.todos ?? []).filter(t => t.checked).length
            }
            if (shape.props.text) {
                const matches = shape.props.text.match(/\[\[[^\]]+\]\]/g)
                if (matches) wikiLinks += matches.length
            }
        }
        cardsByBoard.push({ boardName: board.name, count: shapes.length })
    }

    cardsByBoard.sort((a, b) => b.count - a.count)
    return {
        cardsByBoard,
        totalCards: cardsByBoard.reduce((s, b) => s + b.count, 0),
        completedTodos,
        wikiLinks,
    }
}

/* ------------------------------------------------------------------ WeeklyReviewContent (embeddable) */
interface WeeklyReviewContentProps {
    boards: BoardRecord[]
    onGoToWeeklyCard: () => void
}

export function WeeklyReviewContent({ boards, onGoToWeeklyCard }: WeeklyReviewContentProps) {
    const today = new Date()
    const { start: weekStart, end: weekEnd, weekNum } = getWeekRange(today)

    const stats = useMemo(
        () => computeWeekStats(boards, weekStart, weekEnd),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [boards, weekStart.getTime(), weekEnd.getTime()]
    )

    const startLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`
    const endLabel   = `${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`
    const hasJournalBoard = boards.some(b => b.isJournal)

    const statCard = (bg: string, icon: string, label: string, value: string | number, valueColor: string) => (
        <div style={{ background: bg, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>{icon}</span>
            <span style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 500 }}>{label}</span>
            <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 700, color: valueColor }}>{value}</span>
        </div>
    )

    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            <div style={{ fontSize: 11, color: '#aaa', marginBottom: 16, textAlign: 'center' }}>
                第 {weekNum} 週 · {startLabel} – {endLabel}
            </div>

            <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                本週統計
            </div>

            <div style={{ background: '#f0f4ff', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: stats.cardsByBoard.length > 0 ? 8 : 0 }}>
                    <span style={{ fontSize: 16 }}>📋</span>
                    <span style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 500 }}>本週有活動的卡片</span>
                    <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 700, color: '#2563eb' }}>{stats.totalCards}</span>
                </div>
                {stats.cardsByBoard.length > 0 ? (
                    <div style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {stats.cardsByBoard.map(({ boardName, count }) => (
                            <div key={boardName} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{boardName}</span>
                                <span style={{ color: '#2563eb', fontWeight: 600, flexShrink: 0 }}>{count} 張</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ fontSize: 11, color: '#bbb', paddingLeft: 24 }}>本週尚無活動</div>
                )}
            </div>

            {statCard('#f0fdf4', '✅', '完成待辦', `${stats.completedTodos} 項`, '#16a34a')}
            {statCard('#faf5ff', '🔗', '[[]] 知識連結', `${stats.wikiLinks} 個`, '#7c3aed')}

            <div style={{ fontSize: 11, color: '#bbb', lineHeight: 1.6, padding: '8px 10px', background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0', marginTop: 4 }}>
                統計範圍：本週（週一至週日）有更新記錄的白板
            </div>

            {!hasJournalBoard && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#fffbe6', borderRadius: 8, border: '1px solid #fde68a', fontSize: 11, color: '#92400e' }}>
                    尚未設定 Journal 白板。在白板右鍵選單中選「設為 Journal 白板」即可啟用週回顧卡片。
                </div>
            )}

            <div style={{ padding: '12px 0 4px' }}>
                <button
                    onClick={onGoToWeeklyCard}
                    disabled={!hasJournalBoard}
                    style={{
                        width: '100%', padding: '10px',
                        borderRadius: 10, border: 'none',
                        background: hasJournalBoard
                            ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                            : '#e5e7eb',
                        color: hasJournalBoard ? 'white' : '#9ca3af',
                        fontSize: 13, fontWeight: 600,
                        cursor: hasJournalBoard ? 'pointer' : 'not-allowed',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => { if (hasJournalBoard) e.currentTarget.style.opacity = '0.88' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                >
                    前往 Journal 白板 →
                </button>
            </div>
        </div>
    )
}

/* ------------------------------------------------------------------ WeeklyReview (standalone side-panel) */
interface WeeklyReviewProps {
    boards: BoardRecord[]
    sidebarWidth: number
    onClose: () => void
    onGoToWeeklyCard: () => void
}

export function WeeklyReview({ boards, sidebarWidth, onClose, onGoToWeeklyCard }: WeeklyReviewProps) {
    const today = new Date()
    const { start: weekStart, end: weekEnd, weekNum } = getWeekRange(today)
    const startLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`
    const endLabel   = `${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 19998 }} />
            <div style={{
                position: 'fixed', top: 0, right: sidebarWidth, width: 320, bottom: 0,
                background: 'white', borderLeft: '1px solid #e8e8e8',
                boxShadow: '-4px 0 24px rgba(0,0,0,0.10)',
                zIndex: 19999, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>📅 本週回顧</div>
                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>第 {weekNum} 週 · {startLabel} – {endLabel}</div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #e8e8e8', background: 'transparent', cursor: 'pointer', fontSize: 16, color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >×</button>
                </div>
                <WeeklyReviewContent boards={boards} onGoToWeeklyCard={onGoToWeeklyCard} />
            </div>
        </>
    )
}
