// src/TaskCenter.tsx
import { useState, useEffect, useMemo } from 'react'
import type { BoardRecord } from './db'
import { getTodayStr, getWeekLaterStr, formatDueDate } from './utils/date'
import { getCardShapes } from './utils/snapshot'

import { EmptyState } from './components/ui/EmptyState'
import { SideDrawer } from './components/ui/SideDrawer'
import { T } from './theme/tokens'

interface TaskItem {
    boardId: string
    boardName: string
    shapeId: string
    cardTitle: string
    todoId: string
    todoText: string
    dueDate: string
    checked: boolean
    x: number
    y: number
}

type GroupKey = 'overdue' | 'today' | 'week' | 'later' | 'noduedate'
type FilterTab = 'active' | 'overdue' | 'today' | 'week' | 'all'

const isOpenTask = (item: TaskItem) => !item.checked

function getGroupKey(dueDate: string | undefined, todayStr: string, weekStr: string): GroupKey {
    if (!dueDate) return 'noduedate'
    if (dueDate < todayStr) return 'overdue'
    if (dueDate === todayStr) return 'today'
    if (dueDate <= weekStr) return 'week'
    return 'later'
}

function scanBoards(boards: BoardRecord[]): TaskItem[] {
    const items: TaskItem[] = []
    const seen = new Set<string>()
    for (const board of boards) {
        for (const shape of getCardShapes(board.snapshot)) {
            if (shape.props.type !== 'todo') continue
            for (const t of shape.props.todos ?? []) {
                if (!t.text) continue
                const dedupKey = `${board.id}-${t.id}`
                if (seen.has(dedupKey)) continue
                seen.add(dedupKey)
                items.push({
                    boardId: board.id, boardName: board.name, shapeId: shape.id,
                    cardTitle: shape.props.text || '', todoId: t.id, todoText: t.text,
                    dueDate: t.dueDate ?? '', checked: !!t.checked, x: shape.x ?? 0, y: shape.y ?? 0,
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
    const hoverBg = T.bgHover
    const textColor = T.textPrimary

    return (
        <div
            onClick={() => onJump(item.boardId, item.shapeId, item.x, item.y)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                padding: '7px 16px', cursor: 'pointer',
                background: hovered ? hoverBg : 'transparent',
                display: 'flex', alignItems: 'flex-start', gap: 8,
                transition: 'background 0.1s',
            }}
        >
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
                    color: item.checked ? '#aaa' : textColor,
                    textDecoration: item.checked ? 'line-through' : 'none',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {item.todoText}
                </div>
                <div style={{ fontSize: 11, color: '#bbb', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center', overflow: 'hidden' }}>
                    <span
                        title={item.boardName}
                        style={{
                            flexShrink: 0, maxWidth: 140,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            fontSize: 10, lineHeight: 1.5,
                            color: T.accent,
                            background: T.accentBg,
                            border: `1px solid ${T.accentBorder}`,
                            borderRadius: 4, padding: '1px 6px',
                        }}
                    >🗂 {item.boardName}</span>
                    {item.cardTitle && (
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.cardTitle}</span>
                    )}
                </div>
            </div>
            {item.dueDate && (
                <span style={{
                    fontSize: 10, fontWeight: 500,
                    color: config.color, background: config.bg,
                    borderRadius: 4, padding: '2px 6px', flexShrink: 0, alignSelf: 'center',
                    border: `1px solid ${config.color}22`, whiteSpace: 'nowrap',
                }}>
                    {formatDueDate(item.dueDate, todayStr)}
                </span>
            )}
        </div>
    )
}

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

    const visibleItemsByGroup = useMemo(() => {
        const out: Record<GroupKey, TaskItem[]> = { overdue: [], today: [], week: [], later: [], noduedate: [] }
        for (const key of Object.keys(grouped) as GroupKey[]) {
            out[key] = tab === 'all' ? grouped[key] : grouped[key].filter(isOpenTask)
        }
        return out
    }, [grouped, tab])

    const getVisibleGroups = (): GroupKey[] => {
        if (tab === 'overdue') return ['overdue']
        if (tab === 'today')   return ['today']
        if (tab === 'week')    return ['week']
        const base: GroupKey[] = ['overdue', 'today', 'week', 'later']
        return showNoDueDate ? [...base, 'noduedate'] : base
    }

    const visibleGroups = getVisibleGroups()

    /** 目前被「無截止日任務」收合區藏起來的筆數（0 ＝沒有被藏的東西）。 */
    const hiddenNoDueDateCount = !showNoDueDate && (tab === 'active' || tab === 'all')
        ? visibleItemsByGroup.noduedate.length
        : 0

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    const totalActive   = allItems.filter(t => !t.checked).length
    const totalComplete = allItems.filter(t => t.checked).length

    // 外框、標題列、關閉鈕、底部分隔線都由 SideDrawer 負責；這裡只剩分頁列自己的顏色
    const tabActiveBg = T.bgActive
    const tabInactiveColor = T.textSecondary
    const tabHoverBg = T.bgHover

    const tabs: { key: FilterTab; label: string; count?: number }[] = [
        { key: 'active',  label: '待辦',  count: activeCount },
        { key: 'overdue', label: '逾期',  count: overdueCount },
        { key: 'today',   label: '今天',  count: todayCount },
        { key: 'week',    label: '本週',  count: weekCount },
        { key: 'all',     label: '全部' },
    ]

    return (
        <SideDrawer
            title="任務中心"
            badge={overdueCount > 0 ? (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#ff4d4f', background: '#fff5f5', borderRadius: 10, padding: '1px 7px', border: '1px solid #ffccc7' }}>
                    {overdueCount} 逾期
                </span>
            ) : undefined}
            onClose={onClose}
            bodyPadding="4px 0"
            headerExtra={(
                    <div style={{ display: 'flex', gap: 3 }}>
                        {tabs.map(t => (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key)}
                                style={{
                                    padding: '4px 9px', borderRadius: 8, border: 'none',
                                    background: tab === t.key ? tabActiveBg : 'transparent',
                                    color: tab === t.key ? 'white' : tabInactiveColor,
                                    fontSize: 12, fontWeight: tab === t.key ? 600 : 400,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                    transition: 'background 0.1s',
                                }}
                                onMouseEnter={e => { if (tab !== t.key) e.currentTarget.style.background = tabHoverBg }}
                                onMouseLeave={e => { if (tab !== t.key) e.currentTarget.style.background = 'transparent' }}
                            >
                                {t.label}
                                {t.count !== undefined && t.count > 0 && (
                                    <span style={{
                                        fontSize: 10,
                                        background: tab === t.key ? 'rgba(255,255,255,0.25)' : (T.bgMuted),
                                        borderRadius: 8, padding: '0 5px', lineHeight: '16px',
                                        color: tab === t.key ? 'white' : (t.key === 'overdue' ? '#ff4d4f' : tabInactiveColor),
                                    }}>
                                        {t.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
            )}
            footer={(
                <div style={{ fontSize: 11, color: T.textMuted, display: 'flex', gap: 10 }}>
                    <span>待辦 {totalActive}</span>
                    <span style={{ color: T.textMuted }}>·</span>
                    <span>已完成 {totalComplete}</span>
                    <span style={{ flex: 1 }} />
                    <span>點擊跳轉到卡片</span>
                </div>
            )}
        >
                    {visibleGroups.map(groupKey => {
                        const config = GROUP_CONFIG[groupKey]
                        const items = visibleItemsByGroup[groupKey]
                        if (items.length === 0) return null
                        return (
                            <div key={groupKey} style={{ marginBottom: 4 }}>
                                <div style={{
                                    padding: '5px 16px 4px', fontSize: 11, fontWeight: 600,
                                    color: config.color, background: config.bg,
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    position: 'sticky', top: 0, zIndex: 1,
                                }}>
                                    {config.label}
                                    <span style={{ fontSize: 10, fontWeight: 400, color: '#aaa' }}>{items.length} 項</span>
                                </div>
                                {items.map(item => (
                                    <TaskItemRow
                                        key={`${item.boardId}_${item.shapeId}_${item.todoId}`}
                                        item={item} todayStr={todayStr} weekStr={weekStr}
                                        onJump={onJump}
                                    />
                                ))}
                            </div>
                        )
                    })}
    
                    {visibleGroups.every(k => visibleItemsByGroup[k].length === 0) && (
                        hiddenNoDueDateCount > 0 ? (
                            /* 「待辦」與「全部」分頁不含 noduedate 組（要展開才看得到）。
                               所有待辦都沒設截止日時，這裡原本會說「這個分類沒有任務」，
                               但底部狀態列同時寫著「待辦 N」——畫面自己打自己。
                               所以空狀態要講出真相，並給展開的入口。 */
                            <EmptyState
                                icon="📭"
                                title={`${hiddenNoDueDateCount} 筆待辦沒有設截止日`}
                                hint="沒有截止日的任務不會排進逾期／今天／本週，所以上面是空的。"
                                actionLabel="展開查看 →"
                                onAction={() => setShowNoDueDate(true)}
                            />
                        ) : (
                            <EmptyState
                                icon="✅"
                                title={tab === 'all' ? '所有白板都沒有待辦項目' : '這個分類沒有任務'}
                                hint={tab === 'all'
                                    ? '在白板上建立待辦卡片（斜線選單的「待辦」），設好到期日就會集中到這裡。'
                                    : '換一個分類看看，或到白板上的待辦卡片設定到期日。'}
                            />
                        )
                    )}
    
                    {(tab === 'active' || tab === 'all') && grouped.noduedate.length > 0 && (
                        <div style={{ padding: '8px 16px' }}>
                            <button
                                onClick={() => setShowNoDueDate(v => !v)}
                                style={{ fontSize: 12, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                                <span style={{ fontSize: 10 }}>{showNoDueDate ? '▼' : '▶'}</span>
                                無截止日任務 ({grouped.noduedate.filter(t => !t.checked).length})
                            </button>
                        </div>
                    )}
        </SideDrawer>
    )
}
