// src/TaskCenter.tsx — 任務中心（全螢幕五欄看板）
//
// 原本是右側 360px 抽屜＋分頁；改成全螢幕後五個時間分組直接攤成五欄，分頁就不需要了。
// 「無截止日」原本要點開才看得到（驗收時 71 項很難找），現在是第五欄，已完成預設藏起來。
import { useState, useEffect, useMemo } from 'react'
import type { BoardRecord } from './db'
import { getTodayStr, getWeekLaterStr, formatDueDate } from './utils/date'
import { scanBoards, type TaskItem } from './utils/todoScan'
import { GROUP_ORDER, getGroupKey, groupTasks, type GroupKey } from './utils/taskCenterBoard'

import { FullscreenPanel } from './components/ui/FullscreenPanel'
import { T } from './theme/tokens'
import { Icon } from './components/ui/icons'
import type { IconName } from './components/ui/icons'

/** 欄寬下限：240 × 5 = 1200。視窗再窄就整排橫向捲動，不把欄擠扁。 */
const COLUMN_MIN_WIDTH = 240

// 五個分組是同一條時間軸上的刻度，圖示走同一族（Alarm→Calendar*→Inbox）。
const GROUP_CONFIG: Record<GroupKey, { icon: IconName; label: string; color: string; bg: string }> = {
    overdue:   { icon: 'dueOverdue', label: '已逾期',   color: '#ff4d4f', bg: '#fff5f5' },
    today:     { icon: 'dueToday',   label: '今天',     color: '#e67e00', bg: '#fff7f0' },
    week:      { icon: 'dueWeek',    label: '本週',     color: '#3b82f6', bg: '#eff6ff' },
    later:     { icon: 'dueLater',   label: '之後',     color: '#888',    bg: '#f5f5f5' },
    noduedate: { icon: 'dueNone',    label: '無截止日', color: '#aaa',    bg: '#fafafa' },
}

interface TaskCardProps {
    item: TaskItem
    todayStr: string
    weekStr: string
    onJump: (boardId: string, shapeId: string, x: number, y: number) => void
    onFocus?: (item: TaskItem) => void
}

function TaskCard({ item, todayStr, weekStr, onJump, onFocus }: TaskCardProps) {
    const config = GROUP_CONFIG[getGroupKey(item.dueDate || undefined, todayStr, weekStr)]

    return (
        <div
            onClick={() => onJump(item.boardId, item.shapeId, item.x, item.y)}
            title={item.todoText}
            style={{
                padding: '9px 10px', cursor: 'pointer',
                background: T.bgCard, borderRadius: 8,
                border: `1px solid ${T.borderLight}`,
                display: 'flex', flexDirection: 'column', gap: 6,
                transition: 'background 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = T.bgCardHover }}
            onMouseLeave={e => { e.currentTarget.style.background = T.bgCard }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{
                    width: 14, height: 14, borderRadius: 3,
                    border: `1.5px solid ${item.checked ? '#bbb' : '#d0d0d0'}`,
                    background: item.checked ? '#bbb' : 'transparent',
                    flexShrink: 0, marginTop: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    {item.checked && <span style={{ color: 'white', display: 'flex' }}><Icon name="check" /></span>}
                </div>
                {/* 最多兩行：欄窄，只放一行常看不出是哪一項 */}
                <div style={{
                    flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.45,
                    color: item.checked ? '#aaa' : T.textPrimary,
                    textDecoration: item.checked ? 'line-through' : 'none',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden', wordBreak: 'break-word',
                }}>
                    {item.todoText}
                </div>
                {item.dueDate && (
                    <span style={{
                        fontSize: 10, fontWeight: 500,
                        color: config.color, background: config.bg,
                        borderRadius: 4, padding: '2px 6px', flexShrink: 0,
                        border: `1px solid ${config.color}22`, whiteSpace: 'nowrap',
                    }}>
                        {formatDueDate(item.dueDate, todayStr)}
                    </span>
                )}
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
                <span
                    title={item.boardName}
                    style={{
                        minWidth: 0, flexShrink: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontSize: 10, lineHeight: 1.5,
                        color: T.accent, background: T.accentBg,
                        border: `1px solid ${T.accentBorder}`,
                        borderRadius: 4, padding: '1px 6px',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}
                ><Icon name="cardBoard" />{item.boardName}</span>
                {item.focusCount > 0 && (
                    <span title={`跑完 ${item.focusCount} 個番茄`} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <Icon name="pomodoro" />{item.focusCount}
                    </span>
                )}
                <span style={{ flex: 1 }} />
                {onFocus && !item.checked && (
                    // 常駐：原本只在 hover 時出現，驗收發現要先捲動才叫得出來。
                    <button
                        title="綁這項開始專注"
                        onClick={e => { e.stopPropagation(); onFocus(item) }}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontSize: 11, color: T.accent, background: T.accentBg,
                            border: `1px solid ${T.accentBorder}`, borderRadius: 6,
                            padding: '2px 7px', cursor: 'pointer', flexShrink: 0,
                        }}
                    ><Icon name="pomodoro" />專注</button>
                )}
            </div>
        </div>
    )
}

interface TaskCenterProps {
    boards: BoardRecord[]
    onJump: (boardId: string, shapeId: string, x: number, y: number) => void
    onClose: () => void
    /** 綁這項開番茄鐘 */
    onFocus?: (item: TaskItem) => void
}

export function TaskCenter({ boards, onJump, onClose, onFocus }: TaskCenterProps) {
    const [query, setQuery] = useState('')
    const [showDone, setShowDone] = useState(false)

    const todayStr = getTodayStr()
    const weekStr = getWeekLaterStr()

    const allItems = useMemo(() => scanBoards(boards), [boards])
    const columns = useMemo(
        () => groupTasks(allItems, query, showDone, todayStr, weekStr),
        [allItems, query, showDone, todayStr, weekStr],
    )

    const overdueCount = allItems.filter(t => !t.checked && getGroupKey(t.dueDate || undefined, todayStr, weekStr) === 'overdue').length
    const totalActive   = allItems.filter(t => !t.checked).length
    const totalComplete = allItems.length - totalActive

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    return (
        <FullscreenPanel
            title="任務中心"
            titleIcon="taskCenter"
            badge={`待辦 ${totalActive} · 已完成 ${totalComplete}${overdueCount > 0 ? ` · ${overdueCount} 逾期` : ''}`}
            onClose={onClose}
            padded={false}
            headerContent={(
                <div style={{ maxWidth: 420, margin: '0 auto', position: 'relative' }}>
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="搜尋待辦、白板…"
                        autoFocus
                        style={{
                            width: '100%', height: 34, borderRadius: 8,
                            border: `1px solid ${T.borderMid}`,
                            background: T.bgApp, color: T.textPrimary,
                            padding: query ? '0 32px 0 12px' : '0 12px',
                            fontSize: 13, outline: 'none', boxSizing: 'border-box',
                        }}
                    />
                    {query && (
                        <button
                            onClick={() => setQuery('')}
                            title="清除搜尋"
                            style={{
                                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                color: T.textMuted, padding: 2, display: 'flex',
                            }}
                        ><Icon name="close" /></button>
                    )}
                </div>
            )}
            headerActions={(
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textSecondary, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
                    <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
                    顯示已完成
                </label>
            )}
        >
            <div style={{
                height: '100%', boxSizing: 'border-box',
                display: 'flex', gap: 12, padding: 16,
                overflowX: 'auto', overflowY: 'hidden',
            }}>
                {GROUP_ORDER.map(key => {
                    const config = GROUP_CONFIG[key]
                    const items = columns[key]
                    return (
                        <section key={key} style={{
                            flex: `1 0 ${COLUMN_MIN_WIDTH}px`, minWidth: COLUMN_MIN_WIDTH,
                            display: 'flex', flexDirection: 'column', minHeight: 0,
                            background: T.bgSidebar, borderRadius: 10,
                            border: `1px solid ${T.borderLight}`,
                            borderTop: `3px solid ${config.color}`,
                        }}>
                            <header style={{
                                padding: '10px 12px 8px', flexShrink: 0,
                                display: 'flex', alignItems: 'center', gap: 6,
                                fontSize: 13, fontWeight: 600, color: config.color,
                            }}>
                                <Icon name={config.icon} />{config.label}
                                <span style={{ fontSize: 11, fontWeight: 400, color: T.textMuted }}>{items.length}</span>
                            </header>
                            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {items.length === 0 ? (
                                    <div style={{ fontSize: 12, color: T.textMuted, textAlign: 'center', padding: '20px 0' }}>
                                        {query ? '沒有符合的待辦' : '沒有待辦'}
                                    </div>
                                ) : items.map(item => (
                                    <TaskCard
                                        key={`${item.boardId}_${item.shapeId}_${item.todoId}`}
                                        item={item} todayStr={todayStr} weekStr={weekStr}
                                        onJump={onJump} onFocus={onFocus}
                                    />
                                ))}
                            </div>
                        </section>
                    )
                })}
            </div>
        </FullscreenPanel>
    )
}
