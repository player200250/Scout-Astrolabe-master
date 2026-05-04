import React, { useMemo } from 'react'
import type { BoardRecord } from '../db'
import type { HomeView } from './Whiteboard'
import { getCardShapes } from '../utils/snapshot'
import { getTodayStr, formatRelativeDate, toDateStr } from '../utils/date'

interface DashboardProps {
    boards: BoardRecord[]
    onSwitch: (boardId: string) => void
    onOpenTaskCenter: () => void
    onOpenReviewCenter: () => void
    onOpenKnowledgeGraph: () => void
    onOpenCardLibrary: () => void
    onOpenOverview: () => void
    onQuickCapture: () => void
    isDark: boolean
    sidebarWidth: number
    homeView: HomeView
    onSetHomeView: (v: HomeView) => void
}

function getWeekRange(): { start: string; end: string } {
    const today = new Date()
    const day = today.getDay()
    const daysFromMonday = day === 0 ? 6 : day - 1
    const monday = new Date(today)
    monday.setDate(today.getDate() - daysFromMonday)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { start: toDateStr(monday), end: toDateStr(sunday) }
}

function getISOWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()
}

function getGreeting(): string {
    const h = new Date().getHours()
    if (h >= 6 && h < 12) return '早安'
    if (h >= 12 && h < 18) return '午安'
    return '晚安'
}

function getDateLabel(): string {
    const now = new Date()
    const m = now.getMonth() + 1
    const d = now.getDate()
    const weekDays = ['日', '一', '二', '三', '四', '五', '六']
    const weekDay = weekDays[now.getDay()]
    const weekNum = getISOWeekNumber(now)
    return `今天是 ${m} 月 ${d} 日（週${weekDay}）　第 ${weekNum} 週`
}

const CARD_TYPE_ICON: Record<string, string> = {
    todo: '✅',
    link: '🔗',
    image: '🖼️',
    journal: '📔',
    board: '🗂️',
    text: '📝',
}

export function Dashboard({
    boards, onSwitch, onOpenTaskCenter, onOpenReviewCenter,
    onOpenKnowledgeGraph, onOpenCardLibrary, onOpenOverview,
    onQuickCapture, isDark, sidebarWidth, homeView, onSetHomeView,
}: DashboardProps) {
    const todayStr = getTodayStr()
    const { start: weekStart, end: weekEnd } = useMemo(() => getWeekRange(), [])

    const inboxBoard = useMemo(() => boards.find(b => b.isInbox) ?? null, [boards])
    const journalBoard = useMemo(() => boards.find(b => b.isJournal) ?? null, [boards])

    const stats = useMemo(() => {
        const inboxCount = inboxBoard ? getCardShapes(inboxBoard.snapshot).length : 0
        let overdueCount = 0
        let todayCount = 0
        let weekDoneCount = 0
        for (const board of boards) {
            for (const shape of getCardShapes(board.snapshot)) {
                if (shape.props.type !== 'todo') continue
                for (const t of shape.props.todos ?? []) {
                    if (!t.dueDate) continue
                    if (!t.checked) {
                        if (t.dueDate < todayStr) overdueCount++
                        else if (t.dueDate === todayStr) todayCount++
                    } else {
                        if (t.dueDate >= weekStart && t.dueDate <= weekEnd) weekDoneCount++
                    }
                }
            }
        }
        return { inboxCount, overdueCount, todayCount, weekDoneCount }
    }, [boards, inboxBoard, todayStr, weekStart, weekEnd])

    const journalPreview = useMemo(() => {
        if (!journalBoard) return null
        const shapes = getCardShapes(journalBoard.snapshot)
        const todayCard = shapes.find(s => s.props.journalDate === todayStr)
        if (!todayCard) return null
        const text = stripHtml(todayCard.props.text ?? '')
        return text.length > 0 ? text.slice(0, 60) + (text.length > 60 ? '...' : '') : null
    }, [journalBoard, todayStr])

    const todayTodos = useMemo(() => {
        const items: Array<{
            boardId: string; boardName: string; shapeId: string
            text: string; isOverdue: boolean
        }> = []
        for (const board of boards) {
            if (board.isHome || board.isInbox) continue
            for (const shape of getCardShapes(board.snapshot)) {
                if (shape.props.type !== 'todo') continue
                for (const t of shape.props.todos ?? []) {
                    if (t.checked || !t.dueDate) continue
                    const isOverdue = t.dueDate < todayStr
                    if (isOverdue || t.dueDate === todayStr) {
                        items.push({ boardId: board.id, boardName: board.name, shapeId: shape.id, text: t.text, isOverdue })
                    }
                }
            }
        }
        items.sort((a, b) => (a.isOverdue === b.isOverdue ? 0 : a.isOverdue ? -1 : 1))
        return items
    }, [boards, todayStr])

    const recentBoards = useMemo(() =>
        boards
            .filter(b => !b.isHome && !b.isInbox && b.lastVisitedAt)
            .sort((a, b) => (b.lastVisitedAt ?? 0) - (a.lastVisitedAt ?? 0))
            .slice(0, 3),
        [boards]
    )

    const inboxPreviews = useMemo(() =>
        inboxBoard ? getCardShapes(inboxBoard.snapshot).slice(0, 3) : [],
        [inboxBoard]
    )

    const bg = isDark ? '#0f172a' : '#f9f9f7'
    const cardBg = isDark ? '#1e293b' : '#ffffff'
    const cardBgHover = isDark ? '#243447' : '#f4f4f4'
    const border = isDark ? '#334155' : '#ebebeb'
    const textPrimary = isDark ? '#e2e8f0' : '#1a1a1a'
    const textSecondary = isDark ? '#94a3b8' : '#555'
    const textMuted = isDark ? '#64748b' : '#999'
    const accentColor = isDark ? '#60a5fa' : '#2563eb'

    const sectionLabel: React.CSSProperties = {
        fontSize: 11, fontWeight: 700, color: textMuted,
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14,
    }

    const linkBtn: React.CSSProperties = {
        fontSize: 12, color: accentColor, background: 'transparent',
        border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0,
    }

    const actionBtn: React.CSSProperties = {
        marginTop: 14, padding: '7px 14px', borderRadius: 7,
        border: `1px solid ${border}`, background: 'transparent',
        color: accentColor, cursor: 'pointer', fontSize: 12, fontWeight: 500,
    }

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: sidebarWidth, bottom: 0,
            overflow: 'auto', background: bg,
            transition: 'right 0.2s cubic-bezier(0.4,0,0.2,1)',
            fontFamily: 'inherit',
        }}>
            <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px', color: textPrimary }}>

                {/* ── Header ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
                    <div>
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{getGreeting()}</div>
                        <div style={{ fontSize: 14, color: textSecondary, marginTop: 4 }}>{getDateLabel()}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                        <button
                            onClick={() => onSetHomeView('dashboard')}
                            style={{
                                padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                                fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
                                border: homeView === 'dashboard' ? '1px solid #2563eb' : `1px solid ${border}`,
                                background: homeView === 'dashboard' ? '#2563eb' : cardBg,
                                color: homeView === 'dashboard' ? '#fff' : textSecondary,
                            }}
                        >📊 儀表板</button>
                        <button
                            onClick={() => onSetHomeView('whiteboard')}
                            style={{
                                padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                                fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
                                border: homeView === 'whiteboard' ? '1px solid #2563eb' : `1px solid ${border}`,
                                background: homeView === 'whiteboard' ? '#2563eb' : cardBg,
                                color: homeView === 'whiteboard' ? '#fff' : textSecondary,
                            }}
                        >🖼️ 白板</button>
                        <button
                            onClick={onQuickCapture}
                            style={{
                                padding: '7px 14px', borderRadius: 8, border: `1px solid ${border}`,
                                background: cardBg, color: textSecondary, cursor: 'pointer',
                                fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
                            }}
                        >
                            Ctrl+Space 快速新增 →
                        </button>
                    </div>
                </div>

                {/* ── Stats ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                    {([
                        {
                            label: '收件匣待整理', value: stats.inboxCount,
                            color: textSecondary,
                            onClick: inboxBoard ? () => onSwitch(inboxBoard.id) : undefined,
                        },
                        {
                            label: '逾期任務', value: stats.overdueCount,
                            color: stats.overdueCount > 0 ? '#ef4444' : textSecondary,
                            onClick: onOpenTaskCenter,
                        },
                        {
                            label: '今日到期', value: stats.todayCount,
                            color: stats.todayCount > 0 ? '#f97316' : textSecondary,
                            onClick: onOpenTaskCenter,
                        },
                        {
                            label: '本週完成', value: stats.weekDoneCount,
                            color: '#22c55e',
                            onClick: onOpenTaskCenter,
                        },
                    ] as const).map((s, i) => (
                        <div
                            key={i}
                            onClick={s.onClick}
                            style={{
                                background: cardBg, border: `1px solid ${border}`, borderRadius: 12,
                                padding: '16px 18px', cursor: s.onClick ? 'pointer' : 'default',
                            }}
                        >
                            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
                            <div style={{ fontSize: 12, color: textMuted, marginTop: 6 }}>{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* ── Journal + Today Todos ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                    <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 20 }}>
                        <div style={sectionLabel}>今日日記</div>
                        <div style={{ fontSize: 14, color: textSecondary, lineHeight: 1.7, minHeight: 64 }}>
                            {journalPreview
                                ? journalPreview
                                : <span style={{ color: textMuted, fontStyle: 'italic' }}>尚未填寫今天的日記...</span>
                            }
                        </div>
                        <button style={actionBtn} onClick={onOpenReviewCenter}>開啟今日日記 →</button>
                    </div>

                    <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 20 }}>
                        <div style={sectionLabel}>今日待辦</div>
                        {todayTodos.length === 0 ? (
                            <div style={{ fontSize: 13, color: textMuted, fontStyle: 'italic', minHeight: 64 }}>今日沒有待辦任務</div>
                        ) : (
                            <div style={{ minHeight: 64 }}>
                                {todayTodos.slice(0, 5).map((item, i) => (
                                    <div
                                        key={i}
                                        onClick={() => onSwitch(item.boardId)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '6px 0', cursor: 'pointer',
                                            borderBottom: i < Math.min(todayTodos.length, 5) - 1
                                                ? `1px solid ${border}` : 'none',
                                        }}
                                    >
                                        <div style={{
                                            width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                                            border: `1.5px solid ${item.isOverdue ? '#ef4444' : '#f97316'}`,
                                        }} />
                                        <span style={{
                                            flex: 1, fontSize: 13, color: textPrimary,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {item.text}
                                        </span>
                                        <span style={{
                                            fontSize: 11, padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                                            background: item.isOverdue
                                                ? (isDark ? '#450a0a' : '#fef2f2')
                                                : (isDark ? '#431407' : '#fff7ed'),
                                            color: item.isOverdue ? '#ef4444' : '#f97316',
                                        }}>
                                            {item.isOverdue ? '逾期' : '今天'}
                                        </span>
                                    </div>
                                ))}
                                {todayTodos.length > 5 && (
                                    <div style={{ fontSize: 12, color: textMuted, paddingTop: 8 }}>
                                        還有 {todayTodos.length - 5} 筆...
                                    </div>
                                )}
                            </div>
                        )}
                        <button style={actionBtn} onClick={onOpenTaskCenter}>查看全部 →</button>
                    </div>
                </div>

                {/* ── Recent Boards ── */}
                <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <div style={sectionLabel}>最近使用白板</div>
                        <button style={linkBtn} onClick={onOpenOverview}>白板總覽 →</button>
                    </div>
                    {recentBoards.length === 0 ? (
                        <div style={{ fontSize: 13, color: textMuted, fontStyle: 'italic' }}>尚無最近使用的白板</div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                            {recentBoards.map(board => (
                                <div
                                    key={board.id}
                                    onClick={() => onSwitch(board.id)}
                                    style={{ cursor: 'pointer', borderRadius: 10, border: `1px solid ${border}`, overflow: 'hidden' }}
                                >
                                    <div style={{
                                        height: 80, background: cardBgHover, overflow: 'hidden',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {board.thumbnail
                                            ? <img src={board.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            : <span style={{ fontSize: 22, opacity: 0.5 }}>🗂️</span>
                                        }
                                    </div>
                                    <div style={{ padding: '8px 10px' }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {board.name}
                                        </div>
                                        <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>
                                            {formatRelativeDate(board.lastVisitedAt ?? board.updatedAt)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Inbox Preview ── */}
                {inboxPreviews.length > 0 && (
                    <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <div style={sectionLabel}>收件匣預覽</div>
                            {inboxBoard && (
                                <button style={linkBtn} onClick={() => onSwitch(inboxBoard.id)}>開啟收件匣 →</button>
                            )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {inboxPreviews.map((shape, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 12px', borderRadius: 8,
                                    background: cardBgHover, border: `1px solid ${border}`,
                                }}>
                                    <span style={{ fontSize: 14 }}>
                                        {CARD_TYPE_ICON[shape.props.type ?? 'text'] ?? '📝'}
                                    </span>
                                    <span style={{
                                        flex: 1, fontSize: 13, color: textPrimary,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {stripHtml(shape.props.text ?? '').slice(0, 80) || '（無內容）'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Quick Tools ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {([
                        { icon: '🗂️', label: '卡片庫', onClick: onOpenCardLibrary },
                        { icon: '📔', label: '復盤中心', onClick: onOpenReviewCenter },
                        { icon: '🕸️', label: '知識圖譜', onClick: onOpenKnowledgeGraph },
                    ] as const).map((tool, i) => (
                        <button
                            key={i}
                            onClick={tool.onClick}
                            style={{
                                padding: 18, borderRadius: 12, border: `1px solid ${border}`,
                                background: cardBg, cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                                fontSize: 13, fontWeight: 600, color: textPrimary,
                            }}
                        >
                            <span style={{ fontSize: 24 }}>{tool.icon}</span>
                            {tool.label}
                        </button>
                    ))}
                </div>

            </div>
        </div>
    )
}
