// src/TaskCenter.tsx
import { useState, useEffect, useMemo } from 'react'
import type { TLEditorSnapshot } from 'tldraw'

interface BoardRecord {
    id: string
    name: string
    snapshot: TLEditorSnapshot | null
}

interface TaskItem {
    boardId: string
    boardName: string
    shapeId: string
    cardTitle: string
    todoId: string
    todoText: string
    dueDate: string   // YYYY-MM-DD or ''
    checked: boolean
    x: number
    y: number
}

type GroupKey = 'overdue' | 'today' | 'week' | 'later' | 'noduedate'
type FilterTab = 'active' | 'overdue' | 'today' | 'week' | 'all'

/* ---------------------------------------------------------------
   工具函式
--------------------------------------------------------------- */
function getTodayStr(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekLaterStr(): string {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getGroupKey(dueDate: string | undefined, todayStr: string, weekStr: string): GroupKey {
    if (!dueDate) return 'noduedate'
    if (dueDate < todayStr) return 'overdue'
    if (dueDate === todayStr) return 'today'
    if (dueDate <= weekStr) return 'week'
    return 'later'
}

function formatDueDate(dueDate: string, todayStr: string): string {
    if (dueDate === todayStr) return '今天'
    const [y, m, d] = dueDate.split('-').map(Number)
    const currentYear = new Date().getFullYear()
    if (y === currentYear) return `${m}/${d}`
    return `${y}/${m}/${d}`
}

function scanBoards(boards: BoardRecord[]): TaskItem[] {
    const items: TaskItem[] = []
    const seen = new Set<string>()
    for (const board of boards) {
        if (!board.snapshot) continue
        const store = (board.snapshot as any).document?.store ?? {}
        for (const shape of Object.values(store) as any[]) {
            if (shape.typeName !== 'shape' || shape.type !== 'card' || shape.props?.type !== 'todo') continue
            const todos: any[] = Array.isArray(shape.props.todos) ? shape.props.todos : []
            for (const t of todos) {
                if (!t.text) continue
                const dedupKey = `${board.id}-${t.id}`
                if (seen.has(dedupKey)) continue
                seen.add(dedupKey)
                items.push({
                    boardId: board.id,
                    boardName: board.name,
                    shapeId: shape.id,
                    cardTitle: shape.props.text || '',
                    todoId: t.id,
                    todoText: t.text,
                    dueDate: t.dueDate ?? '',
                    checked: !!t.checked,
                    x: shape.x ?? 0,
                    y: shape.y ?? 0,
                })
            }
        }
    }
    return items
}

const GROUP_CONFIG: Record<GroupKey, { label: string; color: string; bg: string }> = {
    overdue:   { label: '⚠️ 已逾期', color: '#ff4d4f', bg: '#fff5f5' },
    today:     { label: '🌟 今天',   color: '#e67e00', bg: '#fff7f0' },
    week:      { label: '📅 本週',   color: '#3b82f6', bg: '#eff6ff' },
    later:     { label: '🗓️ 之後',  color: '#888',    bg: '#f5f5f5' },
    noduedate: { label: '📋 無截止日', color: '#aaa',  bg: '#fafafa' },
}

/* ---------------------------------------------------------------
   TaskItemRow
--------------------------------------------------------------- */
interface TaskItemRowProps {
    item: TaskItem
    todayStr: string
    weekStr: string
    onJump: (boardId: string, shapeId: string, x: number, y: number) => void
}

function TaskItemRow({ item, todayStr, weekStr, onJump }: TaskItemRowProps) {
    const [hovered, setHovered] = useState(false)
    const groupKey = getGroupKey(item.dueDate || undefined, todayStr, weekStr)
    const config = GROUP_CONFIG[groupKey]

    return (
        <div
            onClick={() => onJump(item.boardId, item.shapeId, item.x, item.y)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                padding: '7px 16px',
                cursor: 'pointer',
                background: hovered ? '#f7f7f7' : 'transparent',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                transition: 'background 0.1s',
            }}
        >
            {/* 視覺 checkbox */}
            <div style={{
                width: 14, height: 14, borderRadius: 3,
                border: `1.5px solid ${item.checked ? '#bbb' : '#d0d0d0'}`,
                background: item.checked ? '#bbb' : 'transparent',
                flexShrink: 0, marginTop: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {item.checked && <span style={{ color: 'white', fontSize: 9, lineHeight: 1 }}>✓</span>}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: 13,
                    color: item.checked ? '#aaa' : '#1a1a1a',
                    textDecoration: item.checked ? 'line-through' : 'none',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {item.todoText}
                </div>
                <div style={{ fontSize: 11, color: '#bbb', marginTop: 1, display: 'flex', gap: 5, alignItems: 'center', overflow: 'hidden' }}>
                    <span style={{ flexShrink: 0 }}>{item.boardName}</span>
                    {item.cardTitle && (
                        <>
                            <span style={{ color: '#e0e0e0', flexShrink: 0 }}>·</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.cardTitle}</span>
                        </>
                    )}
                </div>
            </div>

            {/* 到期日 badge */}
            {item.dueDate && (
                <span style={{
                    fontSize: 10, fontWeight: 500,
                    color: config.color,
                    background: config.bg,
                    borderRadius: 4,
                    padding: '2px 6px',
                    flexShrink: 0,
                    alignSelf: 'center',
                    border: `1px solid ${config.color}22`,
                    whiteSpace: 'nowrap',
                }}>
                    {formatDueDate(item.dueDate, todayStr)}
                </span>
            )}
        </div>
    )
}

/* ---------------------------------------------------------------
   TaskCenter
--------------------------------------------------------------- */
interface TaskCenterProps {
    boards: BoardRecord[]
    onJump: (boardId: string, shapeId: string, x: number, y: number) => void
    onClose: () => void
}

export function TaskCenter({ boards, onJump, onClose }: TaskCenterProps) {
    const [tab, setTab] = useState<FilterTab>('active')
    const [showNoDueDate, setShowNoDueDate] = useState(false)

    const todayStr = getTodayStr()
    const weekStr = getWeekLaterStr()

    const allItems = useMemo(() => scanBoards(boards), [boards])

    const grouped = useMemo(() => {
        const g: Record<GroupKey, TaskItem[]> = { overdue: [], today: [], week: [], later: [], noduedate: [] }
        for (const item of allItems) {
            const key = getGroupKey(item.dueDate || undefined, todayStr, weekStr)
            g[key].push(item)
        }
        return g
    }, [allItems, todayStr, weekStr])

    const overdueCount = grouped.overdue.filter(t => !t.checked).length
    const todayCount   = grouped.today.filter(t => !t.checked).length
    const weekCount    = grouped.week.filter(t => !t.checked).length
    const activeCount  = overdueCount + todayCount + weekCount

    const getVisibleGroups = (): GroupKey[] => {
        if (tab === 'overdue') return ['overdue']
        if (tab === 'today')   return ['today']
        if (tab === 'week')    return ['week']
        const base: GroupKey[] = ['overdue', 'today', 'week', 'later']
        return showNoDueDate ? [...base, 'noduedate'] : base
    }

    const visibleGroups = getVisibleGroups()

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    const tabs: { key: FilterTab; label: string; count?: number }[] = [
        { key: 'active',  label: '待辦',  count: activeCount },
        { key: 'overdue', label: '逾期',  count: overdueCount },
        { key: 'today',   label: '今天',  count: todayCount },
        { key: 'week',    label: '本週',  count: weekCount },
        { key: 'all',     label: '全部' },
    ]

    const totalActive   = allItems.filter(t => !t.checked).length
    const totalComplete = allItems.filter(t => t.checked).length

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: 340,
            height: '100vh',
            background: 'rgba(255,255,255,0.98)',
            backdropFilter: 'blur(12px)',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
            zIndex: 19999,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid #eee',
        }}>
            {/* Header */}
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>任務中心</span>
                    {overdueCount > 0 && (
                        <span style={{
                            fontSize: 11, fontWeight: 600,
                            color: '#ff4d4f', background: '#fff5f5',
                            borderRadius: 10, padding: '1px 7px',
                            border: '1px solid #ffccc7',
                        }}>
                            {overdueCount} 逾期
                        </span>
                    )}
                    <div style={{ flex: 1 }} />
                    <button
                        onClick={onClose}
                        style={{
                            width: 26, height: 26, borderRadius: 7, border: '1px solid #e8e8e8',
                            background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#888',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >✕</button>
                </div>

                {/* Filter tabs */}
                <div style={{ display: 'flex', gap: 3 }}>
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            style={{
                                padding: '4px 9px',
                                borderRadius: 6, border: 'none',
                                background: tab === t.key ? '#1a1a1a' : 'transparent',
                                color: tab === t.key ? 'white' : '#666',
                                fontSize: 12,
                                fontWeight: tab === t.key ? 600 : 400,
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 4,
                                transition: 'background 0.1s',
                            }}
                            onMouseEnter={e => { if (tab !== t.key) e.currentTarget.style.background = '#f5f5f5' }}
                            onMouseLeave={e => { if (tab !== t.key) e.currentTarget.style.background = 'transparent' }}
                        >
                            {t.label}
                            {t.count !== undefined && t.count > 0 && (
                                <span style={{
                                    fontSize: 10,
                                    background: tab === t.key ? 'rgba(255,255,255,0.25)' : '#f0f0f0',
                                    borderRadius: 8, padding: '0 5px', lineHeight: '16px',
                                    color: tab === t.key ? 'white' : (t.key === 'overdue' ? '#ff4d4f' : '#666'),
                                }}>
                                    {t.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                {visibleGroups.map(groupKey => {
                    const config = GROUP_CONFIG[groupKey]
                    const items = tab === 'all'
                        ? grouped[groupKey]
                        : grouped[groupKey].filter(t => !t.checked)
                    if (items.length === 0) return null

                    return (
                        <div key={groupKey} style={{ marginBottom: 4 }}>
                            {/* Group header */}
                            <div style={{
                                padding: '5px 16px 4px',
                                fontSize: 11, fontWeight: 600,
                                color: config.color,
                                background: config.bg,
                                display: 'flex', alignItems: 'center', gap: 6,
                                position: 'sticky', top: 0, zIndex: 1,
                            }}>
                                {config.label}
                                <span style={{ fontSize: 10, fontWeight: 400, color: '#aaa' }}>
                                    {items.length} 項
                                </span>
                            </div>

                            {items.map(item => (
                                <TaskItemRow
                                    key={`${item.boardId}_${item.shapeId}_${item.todoId}`}
                                    item={item}
                                    todayStr={todayStr}
                                    weekStr={weekStr}
                                    onJump={onJump}
                                />
                            ))}
                        </div>
                    )
                })}

                {/* 空狀態 */}
                {visibleGroups.every(k => {
                    const items = tab === 'all' ? grouped[k] : grouped[k].filter(t => !t.checked)
                    return items.length === 0
                }) && (
                    <div style={{ padding: '40px 16px', textAlign: 'center', color: '#ccc', fontSize: 13 }}>
                        {tab === 'all' ? '所有白板都沒有待辦項目' : '這個分類沒有任務'}
                    </div>
                )}

                {/* 無截止日切換（active / all 才顯示） */}
                {(tab === 'active' || tab === 'all') && grouped.noduedate.length > 0 && (
                    <div style={{ padding: '8px 16px' }}>
                        <button
                            onClick={() => setShowNoDueDate(v => !v)}
                            style={{
                                fontSize: 12, color: '#aaa', background: 'none', border: 'none',
                                cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            <span style={{ fontSize: 10 }}>{showNoDueDate ? '▼' : '▶'}</span>
                            無截止日任務 ({grouped.noduedate.filter(t => !t.checked).length})
                        </button>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div style={{
                padding: '8px 16px',
                borderTop: '1px solid #f0f0f0',
                fontSize: 11, color: '#bbb', flexShrink: 0,
                display: 'flex', gap: 10,
            }}>
                <span>待辦 {totalActive}</span>
                <span style={{ color: '#e0e0e0' }}>·</span>
                <span>已完成 {totalComplete}</span>
                <span style={{ flex: 1 }} />
                <span>點擊跳轉到卡片</span>
            </div>
        </div>
    )
}
