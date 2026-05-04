import React, { useState } from 'react'
import {
    DndContext, closestCenter, PointerSensor, useSensor, useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { BoardRecord } from '../db'
import { isRasterThumbnail } from '../utils/boardDb'
import { SidebarFooter } from './SidebarFooter'
import { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, INBOX_BOARD_ID } from '../constants'

interface NavItemDef {
    icon: string
    label: string
    title: string
    onClick: () => void
    isActive: boolean
    badge?: { count: number; color: string }
}

interface BoardTabBarProps {
    boards: BoardRecord[]
    activeBoardId: string
    onSwitch: (id: string) => void
    onNew: () => void
    onRename: (id: string, name: string) => void
    onDelete: (id: string) => void
    onSearch: () => void
    onHotkey: () => void
    onOpenOverview: () => void
    onSetJournal: (boardId: string, isJournal: boolean) => void
    navigationStack: string[]
    onBack: () => void
    onSetParent: (boardId: string, parentId: string | null) => void
    onSwitchToChild: (id: string) => void
    collapsed: boolean
    onToggleCollapse: () => void
    onSetStatus: (boardId: string, status: 'active' | 'archived' | 'pinned') => void
    onOpenTaskCenter: () => void
    onOpenFilter: () => void
    onOpenReviewCenter: () => void
    onOpenBackup: () => void
    onGoToInbox: () => void
    onOpenKnowledgeGraph: () => void
    onOpenCardLibrary: () => void
    isDark: boolean
    onToggleTheme: () => void
    onReorderBoards: (activeId: string, overId: string) => void
    inboxCardCount: number
    onQuickCapture: () => void
    overdueCount: number
    todayCount: number
    onOpenOnboarding: () => void
    activePanel?: string | null
}

function SortableBoardItem({ id, children }: { id: string; children: React.ReactNode }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: isDragging ? 0.4 : 1,
                touchAction: 'none',
                userSelect: 'none',
                cursor: isDragging ? 'grabbing' : 'grab',
            }}
            {...attributes}
            {...listeners}
        >
            {children}
        </div>
    )
}

export function BoardTabBar({ boards, activeBoardId, onSwitch, onNew, onRename, onDelete, onSearch, onHotkey, onOpenOverview, onSetJournal, navigationStack, onBack, onSetParent, onSwitchToChild, collapsed, onToggleCollapse, onSetStatus, onOpenTaskCenter, onOpenFilter, onOpenReviewCenter, onOpenBackup, onGoToInbox, onOpenKnowledgeGraph, onOpenCardLibrary, isDark, onToggleTheme, onReorderBoards, inboxCardCount, onQuickCapture, overdueCount, todayCount, onOpenOnboarding, activePanel }: BoardTabBarProps) {
    const [hoveredId, setHoveredId] = useState<string | null>(null)
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const [contextMenu, setContextMenu] = useState<{ boardId: string; x: number; y: number } | null>(null)
    const [selectingParentFor, setSelectingParentFor] = useState<string | null>(null)
    const [archivedOpen, setArchivedOpen] = useState(false)
    const [recentOpen, setRecentOpen] = useState(true)
    const [pinnedOpen, setPinnedOpen] = useState(true)
    const [allOpen, setAllOpen] = useState(true)

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { delay: 500, tolerance: 8 } })
    )

    const startRename = (board: BoardRecord) => { setRenamingId(board.id); setRenameValue(board.name) }
    const commitRename = (id: string) => { if (renameValue.trim()) onRename(id, renameValue.trim()); setRenamingId(null) }

    const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH

    const hoverBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (over && active.id !== over.id) {
            onReorderBoards(String(active.id), String(over.id))
        }
    }

    return (
        <>
            <div style={{
                position: 'fixed',
                top: 0,
                right: 0,
                width: sidebarWidth,
                bottom: 0,
                background: 'var(--bg-sidebar)',
                backdropFilter: 'blur(8px)',
                borderLeft: '1px solid var(--border-light)',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 10000,
                transition: 'width 0.2s cubic-bezier(0.4,0,0.2,1)',
                overflow: 'hidden',
            }}>
                {/* 頂部工具列 */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: collapsed ? 'center' : 'space-between',
                    padding: collapsed ? '9px 0' : '8px 10px',
                    borderBottom: '1px solid var(--border-light)',
                    flexShrink: 0,
                    gap: 4,
                }}>
                    <button
                        onClick={onToggleCollapse}
                        title={collapsed ? '展開側邊欄' : '收合側邊欄'}
                        style={{
                            width: 28, height: 28, borderRadius: 8,
                            border: '1px solid var(--border-light)',
                            background: 'transparent', cursor: 'pointer',
                            fontSize: 13, color: 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 0, flexShrink: 0,
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                        {collapsed ? '‹' : '›'}
                    </button>

                    {!collapsed && (
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={onNew} title="新增白板" style={{ width: 28, height: 28, borderRadius: 8, border: '1px dashed var(--border-mid)', background: 'transparent', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >+</button>
                            <button onClick={onOpenOverview} title="所有白板 (Ctrl+Shift+O)" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border-light)', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >⊞</button>
                            <button onClick={onSearch} title="搜尋卡片 (Ctrl+F)" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border-light)', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >🔍</button>
                            <button onClick={onQuickCapture} title="快速新增到收件匣 (Ctrl+Space)" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border-light)', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >✏️</button>
                        </div>
                    )}
                </div>

                {/* 功能導覽區 */}
                {(() => {
                    const hBoard = boards.find(b => b.isHome)
                    const navItems: NavItemDef[] = [
                        { icon: '🏠', label: '主頁', title: '主頁', onClick: () => { if (hBoard) onSwitch(hBoard.id) }, isActive: hBoard ? activeBoardId === hBoard.id : false },
                        { icon: '📥', label: '收件匣', title: '收件匣 (Ctrl+Shift+I)', onClick: onGoToInbox, isActive: activeBoardId === INBOX_BOARD_ID, badge: inboxCardCount > 0 ? { count: inboxCardCount, color: '#ef4444' } : undefined },
                        { icon: '🗂️', label: '卡片庫', title: '卡片庫 (Ctrl+Shift+L)', onClick: onOpenCardLibrary, isActive: activePanel === 'cardLibrary' },
                        { icon: '✅', label: '任務中心', title: '任務中心', onClick: onOpenTaskCenter, isActive: activePanel === 'taskCenter', badge: (overdueCount > 0 || todayCount > 0) ? { count: overdueCount > 0 ? overdueCount : todayCount, color: overdueCount > 0 ? '#ef4444' : '#f97316' } : undefined },
                        { icon: '📔', label: '復盤中心', title: '復盤中心 (Ctrl+Shift+C)', onClick: onOpenReviewCenter, isActive: activePanel === 'reviewCenter' },
                        { icon: '🕸️', label: '知識圖譜', title: '知識圖譜 (Ctrl+Shift+G)', onClick: onOpenKnowledgeGraph, isActive: activePanel === 'knowledgeGraph' },
                    ]
                    if (collapsed) {
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 0', borderBottom: '1px solid var(--border-light)', flexShrink: 0 }}>
                                {navItems.map(item => (
                                    <div key={item.label} style={{ position: 'relative' }}>
                                        <button
                                            onClick={item.onClick}
                                            title={item.title}
                                            style={{
                                                width: 28, height: 28, borderRadius: 7,
                                                border: item.isActive ? '2px solid #2563eb' : '1.5px solid transparent',
                                                background: item.isActive ? (isDark ? 'rgba(37,99,235,0.2)' : 'rgba(37,99,235,0.08)') : 'transparent',
                                                cursor: 'pointer', fontSize: 14,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                padding: 0,
                                            }}
                                            onMouseEnter={e => { if (!item.isActive) e.currentTarget.style.background = hoverBg }}
                                            onMouseLeave={e => { e.currentTarget.style.background = item.isActive ? (isDark ? 'rgba(37,99,235,0.2)' : 'rgba(37,99,235,0.08)') : 'transparent' }}
                                        >
                                            {item.icon}
                                        </button>
                                        {item.badge && (
                                            <span style={{ position: 'absolute', top: 0, right: 0, background: item.badge.color, color: 'white', fontSize: 8, fontWeight: 700, borderRadius: 999, minWidth: 12, height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px', lineHeight: 1, border: '1.5px solid var(--bg-sidebar)', pointerEvents: 'none' }}>
                                                {item.badge.count > 99 ? '99+' : item.badge.count}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )
                    }
                    return (
                        <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border-light)' }}>
                            {navItems.map(item => (
                                <button
                                    key={item.label}
                                    onClick={item.onClick}
                                    title={item.title}
                                    style={{
                                        width: '100%', height: 32,
                                        display: 'flex', alignItems: 'center', gap: 0,
                                        padding: 0,
                                        border: 'none', borderLeft: `2.5px solid ${item.isActive ? '#2563eb' : 'transparent'}`,
                                        background: item.isActive ? (isDark ? 'rgba(37,99,235,0.12)' : 'rgba(37,99,235,0.07)') : 'transparent',
                                        cursor: 'pointer', textAlign: 'left',
                                        transition: 'background 0.1s', flexShrink: 0,
                                    }}
                                    onMouseEnter={e => { if (!item.isActive) e.currentTarget.style.background = hoverBg }}
                                    onMouseLeave={e => { if (!item.isActive) e.currentTarget.style.background = 'transparent' }}
                                >
                                    <span style={{ fontSize: 14, width: 36, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                                    <span style={{ fontSize: 13, fontWeight: item.isActive ? 600 : 400, color: item.isActive ? '#2563eb' : 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                                    {item.badge && (
                                        <span style={{ marginRight: 10, background: item.badge.color, color: 'white', fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 5px', minWidth: 16, textAlign: 'center', lineHeight: '16px', flexShrink: 0 }}>
                                            {item.badge.count > 99 ? '99+' : item.badge.count}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )
                })()}

                {/* 麵包屑（展開時才顯示） */}
                {!collapsed && navigationStack.length > 1 && (
                    <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-light)', flexShrink: 0 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, marginBottom: 4 }}>
                            {navigationStack.map((boardId, idx) => {
                                const b = boards.find(b => b.id === boardId)
                                if (!b) return null
                                const isLast = idx === navigationStack.length - 1
                                return (
                                    <React.Fragment key={boardId}>
                                        {idx > 0 && <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>›</span>}
                                        <span
                                            onClick={() => !isLast && onSwitch(boardId)}
                                            style={{ fontSize: 11, cursor: isLast ? 'default' : 'pointer', color: isLast ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: isLast ? 600 : 400 }}
                                        >{b.name}</span>
                                    </React.Fragment>
                                )
                            })}
                        </div>
                        <button
                            onClick={onBack}
                            style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
                        >← 返回</button>
                    </div>
                )}

                {/* 白板列表 */}
                {(() => {
                    const now = Date.now()
                    const STALE_MS = 14 * 86400000

                    const topLevel = boards.filter(b => !b.parentId)
                    const pinnedBoards   = topLevel.filter(b => b.status === 'pinned' && !b.isHome && !b.isInbox)
                    const activeBoards   = topLevel.filter(b => b.status !== 'pinned' && b.status !== 'archived' && !b.isHome && !b.isInbox)
                    const archivedBoards = topLevel.filter(b => b.status === 'archived' && !b.isInbox)

                    const recentBoards = topLevel
                        .filter(b => b.id !== activeBoardId && !b.isHome && !b.isInbox && b.status !== 'archived' && b.status !== 'pinned' && b.lastVisitedAt)
                        .sort((a, b) => (b.lastVisitedAt ?? 0) - (a.lastVisitedAt ?? 0))
                        .slice(0, 5)

                    const renderBoardCard = (board: BoardRecord, opts?: { dimmed?: boolean }) => {
                        const isActive  = activeBoardId === board.id
                        const isHovered = hoveredId === board.id
                        const isStale   = !!(board.lastVisitedAt && (now - board.lastVisitedAt > STALE_MS))
                        return (
                            <div
                                key={`card_${board.id}`}
                                onMouseEnter={() => setHoveredId(board.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                onClick={() => onSwitch(board.id)}
                                onContextMenu={e => { e.preventDefault(); if (!board.isHome && !board.isInbox) setContextMenu({ boardId: board.id, x: e.clientX, y: e.clientY }) }}
                                style={{
                                    position: 'relative', borderRadius: 7,
                                    background: isActive ? 'rgba(37,99,235,0.1)' : isHovered ? hoverBg : 'transparent',
                                    cursor: 'pointer', height: 32,
                                    display: 'flex', alignItems: 'center', gap: 7,
                                    padding: '0 6px 0 8px',
                                    transition: 'background 0.1s',
                                    flexShrink: 0,
                                    opacity: opts?.dimmed ? 0.55 : 1,
                                    borderLeft: isActive ? '2.5px solid #2563eb' : '2.5px solid transparent',
                                }}
                            >
                                <div style={{
                                    width: 20, height: 14, borderRadius: 3, overflow: 'hidden',
                                    background: isDark ? '#2d3748' : '#e8e8e8',
                                    border: `1px solid ${isDark ? '#4a5568' : '#ddd'}`,
                                    flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {isRasterThumbnail(board.thumbnail)
                                        ? <img src={board.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                        : <span style={{ fontSize: 6, color: 'var(--text-muted)' }}>□</span>
                                    }
                                </div>
                                {renamingId === board.id ? (
                                    <input
                                        autoFocus value={renameValue}
                                        onChange={e => setRenameValue(e.target.value)}
                                        onBlur={() => commitRename(board.id)}
                                        onKeyDown={e => { if (e.key === 'Enter') commitRename(board.id); if (e.key === 'Escape') setRenamingId(null); e.stopPropagation() }}
                                        onClick={e => e.stopPropagation()}
                                        style={{ flex: 1, border: 'none', borderBottom: `1px solid ${isDark ? '#94a3b8' : '#333'}`, outline: 'none', fontSize: 12, background: 'transparent', padding: '1px 0', minWidth: 0, color: 'var(--text-primary)' }}
                                    />
                                ) : (
                                    <span
                                        onDoubleClick={e => { e.stopPropagation(); startRename(board) }}
                                        style={{
                                            flex: 1, fontSize: 12.5,
                                            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                            fontWeight: isActive ? 600 : 400,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            userSelect: 'none',
                                            display: 'flex', alignItems: 'center', gap: 4,
                                        }}
                                    >
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {board.status === 'pinned' ? '📌 ' : ''}{board.name}{board.isJournal ? ' 📔' : ''}
                                            {isStale && <span title="超過 14 天未開啟" style={{ marginLeft: 3, fontSize: 9, opacity: 0.4 }}>🕐</span>}
                                        </span>
                                        {board.isInbox && inboxCardCount > 0 && (
                                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0, display: 'inline-block' }} title={`${inboxCardCount} 張未整理卡片`} />
                                        )}
                                    </span>
                                )}
                                {isHovered && !board.isHome && !board.isInbox && (
                                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => startRename(board)}
                                            title="重新命名"
                                            style={{ width: 20, height: 20, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                            onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                        >✎</button>
                                        {boards.length > 1 && (
                                            <button
                                                onClick={() => { if (confirm(`確定刪除「${board.name}」嗎？`)) onDelete(board.id) }}
                                                title="刪除"
                                                style={{ width: 20, height: 20, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#bbb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,77,79,0.1)'; e.currentTarget.style.color = '#ff4d4f' }}
                                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#bbb' }}
                                            >×</button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    }

                    const CollapsibleHeader = ({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) => (
                        <button
                            onClick={onToggle}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                width: '100%', padding: '7px 10px 3px', border: 'none',
                                background: 'transparent', cursor: 'pointer', textAlign: 'left',
                            }}
                        >
                            <span style={{ fontSize: 8, color: 'var(--text-muted)', transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.7px', textTransform: 'uppercase', userSelect: 'none' }}>{label}</span>
                        </button>
                    )

                    if (collapsed) {
                        return (
                            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '6px 0', scrollbarWidth: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {topLevel.filter(b => !b.isHome && !b.isInbox).map(board => {
                                    const isActive = activeBoardId === board.id
                                    return (
                                        <div
                                            key={board.id}
                                            onClick={() => onSwitch(board.id)}
                                            title={board.name}
                                            style={{
                                                width: 26, height: 20, margin: '0 auto',
                                                borderRadius: 4, overflow: 'hidden',
                                                border: isActive ? '2px solid #4a6cf7' : `1.5px solid ${isDark ? '#334155' : '#e0e0e0'}`,
                                                background: isDark ? '#2d3748' : '#f5f5f5',
                                                cursor: 'pointer', flexShrink: 0,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                opacity: board.status === 'archived' ? 0.5 : 1,
                                            }}
                                        >
                                            {isRasterThumbnail(board.thumbnail)
                                                ? <img src={board.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                                : <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>□</span>
                                            }
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    }

                    const sortableActiveBoards = activeBoards
                        .filter(b => !b.isHome)
                        .sort((a, b) => {
                            if (a.sortOrder != null && b.sortOrder != null) return a.sortOrder - b.sortOrder
                            if (a.sortOrder != null) return -1
                            if (b.sortOrder != null) return 1
                            return 0
                        })

                    return (
                        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '6px 6px', scrollbarWidth: 'none', display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {recentBoards.length > 0 && (
                                <>
                                    <div style={{ height: 1, background: 'var(--border-light)', margin: '4px 4px' }} />
                                    <CollapsibleHeader label="最近使用" open={recentOpen} onToggle={() => setRecentOpen(v => !v)} />
                                    {recentOpen && recentBoards.map(b => renderBoardCard(b))}
                                </>
                            )}

                            {pinnedBoards.length > 0 && (
                                <>
                                    <div style={{ height: 1, background: 'var(--border-light)', margin: '4px 4px' }} />
                                    <CollapsibleHeader label="📌 釘選" open={pinnedOpen} onToggle={() => setPinnedOpen(v => !v)} />
                                    {pinnedOpen && pinnedBoards.map(b => renderBoardCard(b))}
                                </>
                            )}

                            {sortableActiveBoards.length > 0 && (
                                <>
                                    <div style={{ height: 1, background: 'var(--border-light)', margin: '4px 4px' }} />
                                    <CollapsibleHeader label="所有白板" open={allOpen} onToggle={() => setAllOpen(v => !v)} />
                                    {allOpen && (
                                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                            <SortableContext items={sortableActiveBoards.map(b => b.id)} strategy={verticalListSortingStrategy}>
                                                {sortableActiveBoards.map(b => (
                                                    <SortableBoardItem key={b.id} id={b.id}>
                                                        {renderBoardCard(b)}
                                                    </SortableBoardItem>
                                                ))}
                                            </SortableContext>
                                        </DndContext>
                                    )}
                                </>
                            )}

                            {archivedBoards.length > 0 && (
                                <>
                                    <div style={{ height: 1, background: 'var(--border-light)', margin: '4px 4px' }} />
                                    <CollapsibleHeader label={`🗄️ 封存 (${archivedBoards.length})`} open={archivedOpen} onToggle={() => setArchivedOpen(v => !v)} />
                                    {archivedOpen && archivedBoards.map(b => renderBoardCard(b, { dimmed: true }))}
                                </>
                            )}
                        </div>
                    )
                })()}

                {!collapsed && (
                    <SidebarFooter
                        onOpenFilter={onOpenFilter}
                        onOpenBackup={onOpenBackup}
                        onHotkey={onHotkey}
                        isDark={isDark}
                        onToggleTheme={onToggleTheme}
                        onOpenOnboarding={onOpenOnboarding}
                    />
                )}
            </div>

            {/* 右鍵選單 */}
            {contextMenu && (() => {
                const targetBoard = boards.find(b => b.id === contextMenu.boardId)
                if (!targetBoard) return null
                const menuBg = isDark ? '#1e293b' : 'white'
                const menuBorder = isDark ? '1px solid #334155' : '1px solid rgba(0,0,0,0.06)'
                const menuItemHover = isDark ? '#2d3748' : '#f5f5f5'
                return (
                    <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 99998 }} onClick={() => setContextMenu(null)} />
                        <div style={{
                            position: 'fixed',
                            left: contextMenu.x + 180 > window.innerWidth ? contextMenu.x - 180 : contextMenu.x,
                            top: contextMenu.y,
                            background: menuBg, borderRadius: 10, padding: '4px 0',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.15), ' + menuBorder,
                            zIndex: 99999, minWidth: 180,
                        }}>
                            <div style={{ padding: '4px 12px 6px', fontSize: 11, color: 'var(--text-muted)', borderBottom: `1px solid var(--border-light)`, marginBottom: 4 }}>
                                {targetBoard.name}
                            </div>
                            <div
                                onClick={() => { onSetJournal(contextMenu.boardId, !targetBoard.isJournal); setContextMenu(null) }}
                                style={{ padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = menuItemHover)}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                {targetBoard.isJournal ? '📔 取消 Journal 白板' : '📔 設為 Journal 白板'}
                            </div>
                            <div style={{ height: 1, background: 'var(--border-light)', margin: '4px 0' }} />
                            <div
                                onClick={() => {
                                    onSetStatus(contextMenu.boardId, targetBoard.status === 'pinned' ? 'active' : 'pinned')
                                    setContextMenu(null)
                                }}
                                style={{ padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = menuItemHover)}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                {targetBoard.status === 'pinned' ? '📌 取消釘選' : '📌 釘選白板'}
                            </div>
                            <div
                                onClick={() => {
                                    onSetStatus(contextMenu.boardId, targetBoard.status === 'archived' ? 'active' : 'archived')
                                    setContextMenu(null)
                                }}
                                style={{ padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = menuItemHover)}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                {targetBoard.status === 'archived' ? '↩ 取消封存' : '🗄️ 封存白板'}
                            </div>
                            <div style={{ height: 1, background: 'var(--border-light)', margin: '4px 0' }} />
                            <div
                                onClick={() => { setSelectingParentFor(contextMenu.boardId); setContextMenu(null) }}
                                style={{ padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = menuItemHover)}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                📂 設為子板...
                            </div>
                            <div style={{ height: 1, background: 'var(--border-light)', margin: '4px 0' }} />
                            <div
                                onClick={() => { if (confirm(`確定刪除「${targetBoard.name}」嗎？`)) { onDelete(contextMenu.boardId); setContextMenu(null) } }}
                                style={{ padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: '#e03131' }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#fff5f5')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                🗑️ 刪除白板
                            </div>
                            {boards.filter(b => b.parentId === contextMenu.boardId).length > 0 && (() => {
                                const renderChildren = (parentId: string, depth: number): React.ReactNode => {
                                    return boards.filter(b => b.parentId === parentId).map(child => (
                                        <React.Fragment key={child.id}>
                                            <div
                                                style={{ display: 'flex', alignItems: 'center', paddingLeft: 14 + depth * 12, paddingRight: 8 }}
                                                onMouseEnter={e => (e.currentTarget.style.background = menuItemHover)}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                {renamingId === child.id ? (
                                                    <input
                                                        autoFocus defaultValue={child.name}
                                                        onBlur={() => commitRename(child.id)}
                                                        onKeyDown={e => { if (e.key === 'Enter') commitRename(child.id); if (e.key === 'Escape') setRenamingId(null); e.stopPropagation() }}
                                                        onChange={e => setRenameValue(e.target.value)}
                                                        onClick={e => e.stopPropagation()}
                                                        style={{ flex: 1, border: 'none', borderBottom: '1px solid #333', outline: 'none', fontSize: 13, background: 'transparent', padding: '4px 0', color: 'var(--text-primary)' }}
                                                    />
                                                ) : (
                                                    <div
                                                        onClick={() => { onSwitchToChild(child.id); setContextMenu(null) }}
                                                        style={{ flex: 1, padding: '7px 6px 7px 0', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}
                                                    >
                                                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{depth > 0 ? '└' : '📋'}</span>
                                                        {child.name}
                                                    </div>
                                                )}
                                                <button onClick={e => { e.stopPropagation(); startRename(child) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: '2px 4px', borderRadius: 4, flexShrink: 0 }}>✏️</button>
                                                <button onClick={e => { e.stopPropagation(); onSetParent(child.id, null); setContextMenu(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: '2px 4px', borderRadius: 4, flexShrink: 0, whiteSpace: 'nowrap' }}>↑主板</button>
                                                <button onClick={e => { e.stopPropagation(); if (confirm(`確定刪除「${child.name}」嗎？`)) { onDelete(child.id); setContextMenu(null) } }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 14, padding: '2px 4px', borderRadius: 4, flexShrink: 0 }}>×</button>
                                            </div>
                                            {renderChildren(child.id, depth + 1)}
                                        </React.Fragment>
                                    ))
                                }
                                return (
                                    <>
                                        <div style={{ height: 1, background: 'var(--border-light)', margin: '4px 4px' }} />
                                        <div style={{ padding: '4px 14px 2px', fontSize: 11, color: 'var(--text-muted)' }}>子板</div>
                                        {renderChildren(contextMenu.boardId, 0)}
                                    </>
                                )
                            })()}
                        </div>
                    </>
                )
            })()}

            {/* 選擇父板 dialog */}
            {selectingParentFor && (() => {
                const target = boards.find(b => b.id === selectingParentFor)
                const getDescendants = (id: string): string[] => {
                    const children = boards.filter(b => b.parentId === id).map(b => b.id)
                    return [...children, ...children.flatMap(getDescendants)]
                }
                const excluded = new Set([selectingParentFor, ...getDescendants(selectingParentFor)])
                const buildTree = (parentId: string | null | undefined, depth: number): { board: BoardRecord; depth: number }[] => {
                    return boards
                        .filter(b => (b.parentId ?? null) === (parentId ?? null) && !excluded.has(b.id))
                        .flatMap(b => [{ board: b, depth }, ...buildTree(b.id, depth + 1)])
                }
                const tree = buildTree(null, 0)
                const dialogBg = isDark ? '#1e293b' : 'white'
                return (
                    <>
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99998 }} onClick={() => setSelectingParentFor(null)} />
                        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: dialogBg, borderRadius: 14, padding: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.3)', zIndex: 99999, minWidth: 280, border: `1px solid var(--border-light)` }}>
                            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>設為子板</div>
                            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>將「{target?.name}」設為哪個白板的子板？</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {tree.map(({ board: b, depth }) => (
                                    <div key={b.id} onClick={() => { onSetParent(selectingParentFor, b.id); setSelectingParentFor(null) }} style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid var(--border-light)`, fontSize: 13, marginLeft: depth * 16, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }} onMouseEnter={e => (e.currentTarget.style.background = hoverBg)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                        {depth > 0 && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>└</span>}
                                        {b.name}
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => setSelectingParentFor(null)} style={{ marginTop: 12, width: '100%', padding: '8px', borderRadius: 8, border: `1px solid var(--border-light)`, cursor: 'pointer', fontSize: 13, background: 'transparent', color: 'var(--text-primary)' }}>取消</button>
                        </div>
                    </>
                )
            })()}
        </>
    )
}
