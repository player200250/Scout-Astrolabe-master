import React, { useState, useEffect } from 'react'
import type { BoardRecord } from '../db'
import { isRasterThumbnail } from '../utils/boardDb'
import { formatRelativeDate } from '../utils/date'

interface BoardOverviewProps {
    boards: BoardRecord[]
    activeBoardId: string
    onSelect: (id: string) => void
    onNew: () => void
    onRename: (id: string, name: string) => void
    onDelete: (id: string) => void
    onSetStatus: (id: string, status: 'active' | 'archived' | 'pinned') => void
    onClose: () => void
    isDark: boolean
}

export function BoardOverview({ boards, activeBoardId, onSelect, onNew, onRename, onDelete, onSetStatus, onClose, isDark }: BoardOverviewProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [hoveredId, setHoveredId] = useState<string | null>(null)
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const [archiveFilter, setArchiveFilter] = useState<'all' | 'archived'>('all')
    const [selectionMode, setSelectionMode] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    const filtered = boards
        .filter(b => {
            if (b.isHome || b.isInbox) return false
            if (!b.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
            if (archiveFilter === 'archived') return b.status === 'archived'
            return b.status !== 'archived'
        })
        .sort((a, b) => b.updatedAt - a.updatedAt)

    const childCount = (id: string) => boards.filter(b => b.parentId === id).length

    const startRename = (board: BoardRecord, e: React.MouseEvent) => {
        e.stopPropagation()
        setRenamingId(board.id)
        setRenameValue(board.name)
    }

    const commitRename = (id: string) => {
        if (renameValue.trim()) onRename(id, renameValue.trim())
        setRenamingId(null)
    }

    const toggleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const exitSelectionMode = () => {
        setSelectionMode(false)
        setSelectedIds(new Set())
    }

    const archiveSelected = () => {
        selectedIds.forEach(id => onSetStatus(id, 'archived'))
        exitSelectionMode()
    }

    const deleteSelected = () => {
        if (!confirm(`確定刪除選取的 ${selectedIds.size} 個白板嗎？此操作無法復原。`)) return
        selectedIds.forEach(id => onDelete(id))
        exitSelectionMode()
    }

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (selectionMode) exitSelectionMode()
                else onClose()
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose, selectionMode])

    const overlayBg = isDark ? 'rgba(15,23,42,0.97)' : 'rgba(245,245,243,0.97)'
    const headerBg = isDark ? 'rgba(30,41,59,0.95)' : 'rgba(255,255,255,0.8)'
    const headerBorder = isDark ? '#334155' : '#e8e8e6'
    const cardBg = isDark ? '#1e293b' : 'white'
    const cardBorderActive = isDark ? '#e2e8f0' : '#1a1a1a'
    const cardBorderHover = isDark ? '#475569' : '#d0d0ce'
    const cardBorderDefault = isDark ? '#334155' : '#e8e8e6'
    const thumbBg = isDark ? '#0f172a' : '#f7f7f5'
    const thumbBorder = isDark ? '#334155' : '#f0f0ee'
    const filterBg = isDark ? '#0f172a' : '#f5f5f3'
    const filterBtnActive = isDark ? '#1e293b' : 'white'
    const inputBg = isDark ? '#0f172a' : '#fafaf8'
    const inputBorder = isDark ? '#334155' : '#e0e0de'
    const textPrimary = isDark ? '#e2e8f0' : '#1a1a1a'
    const textMuted = isDark ? '#64748b' : '#bbb'
    const countBg = isDark ? '#1e293b' : '#f0f0ee'
    const countColor = isDark ? '#64748b' : '#999'

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 20000,
            background: overlayBg,
            backdropFilter: 'blur(12px)',
            display: 'flex', flexDirection: 'column',
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 24px', borderBottom: `1px solid ${headerBorder}`,
                background: headerBg, flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: textPrimary, letterSpacing: '-0.3px' }}>
                        所有白板
                    </span>
                    <span style={{ fontSize: 11, color: countColor, background: countBg, borderRadius: 6, padding: '2px 8px' }}>
                        {filtered.length}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 2, background: filterBg, borderRadius: 8, padding: 3 }}>
                    {(['all', 'archived'] as const).map(v => (
                        <button key={v} onClick={() => setArchiveFilter(v)} style={{
                            padding: '3px 10px', borderRadius: 6, border: 'none',
                            background: archiveFilter === v ? filterBtnActive : 'transparent',
                            color: archiveFilter === v ? textPrimary : countColor,
                            fontSize: 12, fontWeight: archiveFilter === v ? 600 : 400,
                            cursor: 'pointer',
                            boxShadow: archiveFilter === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        }}>
                            {v === 'all' ? '一般' : '🗄️ 封存'}
                        </button>
                    ))}
                </div>
                <div style={{ flex: 1, maxWidth: 300, marginLeft: 4, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: countColor, fontSize: 13, pointerEvents: 'none' }}>🔍</span>
                    <input
                        autoFocus={!selectionMode}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="搜尋白板名稱..."
                        style={{
                            width: '100%', paddingLeft: 30, paddingRight: 12, paddingTop: 6, paddingBottom: 6,
                            borderRadius: 8, border: `1px solid ${inputBorder}`, background: inputBg,
                            fontSize: 13, color: textPrimary, outline: 'none', boxSizing: 'border-box',
                        }}
                    />
                </div>
                <div style={{ flex: 1 }} />
                {/* 多選模式切換 */}
                <button
                    onClick={() => { setSelectionMode(v => !v); setSelectedIds(new Set()) }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                        borderRadius: 8, border: `1px solid ${selectionMode ? '#2563eb' : inputBorder}`,
                        background: selectionMode ? (isDark ? 'rgba(37,99,235,0.2)' : '#eff6ff') : 'transparent',
                        color: selectionMode ? '#2563eb' : countColor,
                        fontSize: 13, cursor: 'pointer', flexShrink: 0,
                    }}
                >☑ 選取</button>
                <button
                    onClick={() => {
                        const nameCounts: Record<string, BoardRecord[]> = {}
                        boards.filter(b => !b.isHome).forEach(b => {
                            if (!nameCounts[b.name]) nameCounts[b.name] = []
                            nameCounts[b.name].push(b)
                        })
                        const toDelete = Object.values(nameCounts)
                            .flatMap(group => {
                                if (group.length <= 1) return []
                                const empties = group.filter(b => !b.snapshot)
                                return empties.length > 0 ? empties : []
                            })
                        if (toDelete.length === 0) {
                            alert('沒有發現重複的空白板。')
                            return
                        }
                        const names = toDelete.map(b => `・${b.name}`).join('\n')
                        if (confirm(`以下 ${toDelete.length} 個空白板將被刪除：\n\n${names}\n\n確定繼續？`)) {
                            toDelete.forEach(b => onDelete(b.id))
                        }
                    }}
                    title="清理同名且空的重複白板"
                    style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                        borderRadius: 8, border: `1px solid ${inputBorder}`, background: 'transparent', color: countColor,
                        fontSize: 13, cursor: 'pointer', flexShrink: 0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(224,49,49,0.15)' : '#fff5f5'; e.currentTarget.style.color = '#e03131'; e.currentTarget.style.borderColor = isDark ? '#7f1d1d' : '#ffccc7' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = countColor; e.currentTarget.style.borderColor = inputBorder }}
                >🧹 清理重複</button>
                <button
                    onClick={() => { onNew(); onClose() }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                        borderRadius: 8, border: 'none', background: isDark ? '#e2e8f0' : '#1a1a1a', color: isDark ? '#0f172a' : 'white',
                        fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
                    }}
                >+ 新增白板</button>
                <button
                    onClick={onClose}
                    title="關閉 (Esc)"
                    style={{
                        width: 30, height: 30, borderRadius: 8, border: `1px solid ${inputBorder}`,
                        background: 'transparent', cursor: 'pointer', fontSize: 15, color: countColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
                    }}
                >✕</button>
            </div>

            <div style={{
                flex: 1, overflowY: 'auto', padding: '20px 24px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gridAutoRows: 'max-content',
                gap: 14, alignContent: 'start',
            }}>
                {filtered.map(board => {
                    const isSelected = selectedIds.has(board.id)
                    return (
                        <div
                            key={board.id}
                            onMouseEnter={() => setHoveredId(board.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            onClick={e => {
                                if (selectionMode) toggleSelect(board.id, e)
                                else { onSelect(board.id); onClose() }
                            }}
                            style={{
                                borderRadius: 12,
                                border: isSelected
                                    ? '2px solid #2563eb'
                                    : activeBoardId === board.id
                                        ? `2px solid ${cardBorderActive}`
                                        : `2px solid ${hoveredId === board.id ? cardBorderHover : cardBorderDefault}`,
                                background: cardBg, cursor: 'pointer', overflow: 'hidden',
                                transition: 'border-color 0.15s, box-shadow 0.15s',
                                boxShadow: hoveredId === board.id ? '0 4px 16px rgba(0,0,0,0.12)' : '0 1px 4px rgba(0,0,0,0.06)',
                                display: 'flex', flexDirection: 'column',
                                position: 'relative',
                            }}
                        >
                            {/* 多選 checkbox */}
                            {selectionMode && (
                                <div
                                    style={{
                                        position: 'absolute', top: 8, left: 8, zIndex: 1,
                                        width: 20, height: 20, borderRadius: 6,
                                        background: isSelected ? '#2563eb' : (isDark ? 'rgba(30,41,59,0.8)' : 'rgba(255,255,255,0.9)'),
                                        border: isSelected ? '2px solid #2563eb' : `2px solid ${isDark ? '#475569' : '#d0d0ce'}`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 12, color: 'white',
                                        backdropFilter: 'blur(4px)',
                                    }}
                                    onClick={e => toggleSelect(board.id, e)}
                                >
                                    {isSelected ? '✓' : ''}
                                </div>
                            )}

                            <div style={{
                                width: '100%', aspectRatio: '16/10', background: thumbBg,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                overflow: 'hidden', borderBottom: `1px solid ${thumbBorder}`, position: 'relative',
                            }}>
                                {isRasterThumbnail(board.thumbnail) ? (
                                    <img src={board.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8, boxSizing: 'border-box' }} alt="" />
                                ) : (
                                    <span style={{ fontSize: 24, opacity: 0.15 }}>□</span>
                                )}
                                {activeBoardId === board.id && (
                                    <div style={{ position: 'absolute', top: 7, right: 7, background: isDark ? '#e2e8f0' : '#1a1a1a', color: isDark ? '#0f172a' : 'white', fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4 }}>使用中</div>
                                )}
                                {childCount(board.id) > 0 && (
                                    <div style={{ position: 'absolute', bottom: 7, left: 7, background: 'rgba(0,0,0,0.55)', color: 'white', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>📋 {childCount(board.id)} 個子板</div>
                                )}
                                {board.isJournal && (
                                    <div style={{ position: 'absolute', bottom: 7, right: 7, background: 'rgba(99,56,6,0.8)', color: 'white', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>📔 Journal</div>
                                )}
                            </div>

                            <div style={{ padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 6, minHeight: 42 }}>
                                {renamingId === board.id ? (
                                    <input
                                        autoFocus value={renameValue}
                                        onChange={e => setRenameValue(e.target.value)}
                                        onBlur={() => commitRename(board.id)}
                                        onKeyDown={e => { if (e.key === 'Enter') commitRename(board.id); if (e.key === 'Escape') setRenamingId(null); e.stopPropagation() }}
                                        onClick={e => e.stopPropagation()}
                                        style={{ flex: 1, border: 'none', borderBottom: `1.5px solid ${textPrimary}`, outline: 'none', fontSize: 13, fontWeight: 500, background: 'transparent', padding: '2px 0', color: textPrimary }}
                                    />
                                ) : (
                                    <>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{board.name}</div>
                                            <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>{formatRelativeDate(board.updatedAt)}</div>
                                        </div>
                                        {!selectionMode && hoveredId === board.id && (
                                            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                                                <button onClick={e => startRename(board, e)} title="重新命名" style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${inputBorder}`, background: cardBg, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, color: textPrimary }}>✎</button>
                                                {boards.filter(b => !b.isHome).length > 1 && (
                                                    <button
                                                        onClick={e => { e.stopPropagation(); if (confirm(`確定刪除「${board.name}」嗎？`)) onDelete(board.id) }}
                                                        title="刪除"
                                                        style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${inputBorder}`, background: cardBg, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, color: '#e84040' }}
                                                    >✕</button>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )
                })}

                {filtered.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 0', color: textMuted, fontSize: 14 }}>
                        {searchQuery ? `找不到「${searchQuery}」相關的白板` : '還沒有白板'}
                    </div>
                )}
            </div>

            {/* 批次操作列 */}
            {selectionMode && (
                <div style={{
                    position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: isDark ? '#1e293b' : 'white',
                    border: `1px solid ${isDark ? '#334155' : '#e8e8e6'}`,
                    borderRadius: 12, padding: '10px 16px',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
                    zIndex: 10,
                }}>
                    <span style={{ fontSize: 13, color: textMuted, marginRight: 4 }}>
                        已選取 {selectedIds.size} 個
                    </span>
                    <button
                        onClick={archiveSelected}
                        disabled={selectedIds.size === 0}
                        style={{
                            padding: '6px 14px', borderRadius: 8, border: 'none',
                            background: selectedIds.size > 0 ? '#f59e0b' : (isDark ? '#334155' : '#f5f5f3'),
                            color: selectedIds.size > 0 ? 'white' : textMuted,
                            fontSize: 13, cursor: selectedIds.size > 0 ? 'pointer' : 'default', fontWeight: 500,
                        }}
                    >🗄️ 封存選取</button>
                    <button
                        onClick={deleteSelected}
                        disabled={selectedIds.size === 0}
                        style={{
                            padding: '6px 14px', borderRadius: 8, border: 'none',
                            background: selectedIds.size > 0 ? '#ef4444' : (isDark ? '#334155' : '#f5f5f3'),
                            color: selectedIds.size > 0 ? 'white' : textMuted,
                            fontSize: 13, cursor: selectedIds.size > 0 ? 'pointer' : 'default', fontWeight: 500,
                        }}
                    >🗑️ 刪除選取</button>
                    <button
                        onClick={exitSelectionMode}
                        style={{
                            padding: '6px 14px', borderRadius: 8,
                            border: `1px solid ${isDark ? '#334155' : '#e8e8e6'}`,
                            background: 'transparent', color: textMuted,
                            fontSize: 13, cursor: 'pointer',
                        }}
                    >取消</button>
                </div>
            )}
        </div>
    )
}
