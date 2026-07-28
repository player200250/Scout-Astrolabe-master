import React, { useState, useEffect, useCallback } from 'react'
import type { BoardRecord, BoardTemplateRecord } from '../db'
import { saveBoardAsTemplate, loadBoardTemplates, deleteBoardTemplate, renameBoardTemplate } from '../db'
import { isRasterThumbnail } from '../utils/boardDb'
import { formatRelativeDate } from '../utils/date'
import { T } from '../theme/tokens'
import { showToast } from '../utils/toast'
import { promptName } from '../utils/promptName'
import { InlineEdit } from './ui/InlineEdit'
import { EmptyState } from './ui/EmptyState'

interface BoardOverviewProps {
    boards: BoardRecord[]
    activeBoardId: string
    onSelect: (id: string) => void
    onNew: () => void
    onCreateFromTemplate: (template: BoardTemplateRecord) => void
    onRename: (id: string, name: string) => void
    onDelete: (id: string) => void
    onSetStatus: (id: string, status: 'active' | 'archived' | 'pinned') => void
    onClose: () => void
}

export function BoardOverview({ boards, activeBoardId, onSelect, onNew, onCreateFromTemplate, onRename, onDelete, onSetStatus, onClose }: BoardOverviewProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [hoveredId, setHoveredId] = useState<string | null>(null)
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [archiveFilter, setArchiveFilter] = useState<'all' | 'archived'>('all')
    const [selectionMode, setSelectionMode] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    // N19 白板模板
    const [pickerOpen, setPickerOpen] = useState(false)
    const [templates, setTemplates] = useState<BoardTemplateRecord[]>([])
    const [hoveredTemplateId, setHoveredTemplateId] = useState<string | null>(null)
    const [renamingTemplateId, setRenamingTemplateId] = useState<string | null>(null)

    const refreshTemplates = useCallback(async () => {
        try { setTemplates(await loadBoardTemplates()) }
        catch { setTemplates([]) }
    }, [])

    const startTemplateRename = useCallback((t: BoardTemplateRecord, e: React.MouseEvent) => {
        e.stopPropagation()
        setRenamingTemplateId(t.id)
    }, [])

    const commitTemplateRename = useCallback(async (id: string, value: string) => {
        const name = value.trim()
        setRenamingTemplateId(null)
        if (name) { await renameBoardTemplate(id, name); await refreshTemplates() }
    }, [refreshTemplates])

    const openPicker = useCallback(() => { refreshTemplates(); setPickerOpen(true) }, [refreshTemplates])

    const saveAsTemplate = useCallback(async (board: BoardRecord, e: React.MouseEvent) => {
        e.stopPropagation()
        // TD9 起可以真的問名字了（Electron 沒有 window.prompt，先前只能用預設名）
        const name = await promptName({
            title: '存為白板模板',
            defaultValue: `${board.name} 模板`,
            placeholder: '模板名稱',
            confirmLabel: '儲存',
        })
        if (name === null) return
        await saveBoardAsTemplate(board, name)
        await refreshTemplates()
        showToast(`已存為白板模板「${name}」\n按頂部「⧉ 從模板」即可一鍵新建。`, 'success')
    }, [refreshTemplates])

    const removeTemplate = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        await deleteBoardTemplate(id)
        await refreshTemplates()
    }, [refreshTemplates])

    const filtered = boards
        .filter(b => {
            if (b.isHome || b.isInbox) return false
            if (!b.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
            if (archiveFilter === 'archived') return b.status === 'archived'
            return b.status !== 'archived'
        })
        .sort((a, b) => b.updatedAt - a.updatedAt)

    const childCount = (id: string) => boards.filter(b => b.parentId === id).length
    const parentName = (id: string | null | undefined) => (id ? boards.find(b => b.id === id)?.name : undefined)

    const startRename = (board: BoardRecord, e: React.MouseEvent) => {
        e.stopPropagation()
        setRenamingId(board.id)
    }

    const commitRename = (id: string, value: string) => {
        if (value.trim()) onRename(id, value.trim())
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
        selectedIds.forEach(id => onDelete(id))
        exitSelectionMode()
    }

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (pickerOpen) setPickerOpen(false)
                else if (selectionMode) exitSelectionMode()
                else onClose()
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose, selectionMode, pickerOpen])

    const overlayBg = T.bgOverlay
    const headerBg = T.bgOverlay
    const headerBorder = T.borderLight
    const cardBg = T.bgPanel
    const cardBorderActive = T.textPrimary
    const cardBorderHover = T.borderMid
    const cardBorderDefault = T.borderLight
    const thumbBg = T.bgApp
    const thumbBorder = T.borderLight
    const filterBg = T.bgApp
    const filterBtnActive = T.bgPanel
    const inputBg = T.bgApp
    const inputBorder = T.borderLight
    const textPrimary = T.textPrimary
    const textMuted = T.textMuted
    const countBg = T.bgApp
    const countColor = T.textMuted

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
                        background: selectionMode ? (T.accentBg) : 'transparent',
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
                            showToast('沒有發現重複的空白板。')
                            return
                        }
                        toDelete.forEach(b => onDelete(b.id))
                    }}
                    title="清理同名且空的重複白板"
                    style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                        borderRadius: 8, border: `1px solid ${inputBorder}`, background: 'transparent', color: countColor,
                        fontSize: 13, cursor: 'pointer', flexShrink: 0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.dangerBgSoft; e.currentTarget.style.color = '#e03131'; e.currentTarget.style.borderColor = T.dangerBorder }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = countColor; e.currentTarget.style.borderColor = inputBorder }}
                >🧹 清理重複</button>
                <button
                    onClick={openPicker}
                    title="從白板模板一鍵新建"
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                        borderRadius: 8, border: `1px solid ${inputBorder}`, background: 'transparent', color: countColor,
                        fontSize: 13, cursor: 'pointer', flexShrink: 0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = '#2563eb'; e.currentTarget.style.borderColor = '#2563eb' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = countColor; e.currentTarget.style.borderColor = inputBorder }}
                >⧉ 從模板</button>
                <button
                    onClick={() => { onNew(); onClose() }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                        borderRadius: 8, border: 'none', background: T.bgActive, color: T.textOnActive,
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
                                        background: isSelected ? '#2563eb' : (T.bgOverlay),
                                        border: isSelected ? '2px solid #2563eb' : `2px solid ${T.borderMid}`,
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
                                    <div style={{ position: 'absolute', top: 7, right: 7, background: T.bgActive, color: T.textOnActive, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4 }}>使用中</div>
                                )}
                                {!selectionMode && parentName(board.parentId) && (
                                    <div title={`子板 · 隸屬「${parentName(board.parentId)}」`} style={{ position: 'absolute', top: 7, left: 7, maxWidth: 'calc(100% - 14px)', display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(37,99,235,0.9)', color: 'white', fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 4 }}>
                                        <span style={{ flexShrink: 0 }}>↳</span>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parentName(board.parentId)}</span>
                                    </div>
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
                                    <InlineEdit
                                        value={board.name}
                                        onCommit={v => commitRename(board.id, v)}
                                        onCancel={() => setRenamingId(null)}
                                        style={{ flex: 1, border: 'none', borderBottom: `1.5px solid ${textPrimary}`, fontSize: 13, fontWeight: 500, padding: '2px 0' }}
                                    />
                                ) : (
                                    <>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{board.name}</div>
                                            <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>{formatRelativeDate(board.updatedAt)}</div>
                                        </div>
                                        {!selectionMode && hoveredId === board.id && (
                                            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                                                <button onClick={e => saveAsTemplate(board, e)} title="存為白板模板" style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${inputBorder}`, background: cardBg, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, color: textPrimary }}>⧉</button>
                                                <button onClick={e => startRename(board, e)} title="重新命名" style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${inputBorder}`, background: cardBg, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, color: textPrimary }}>✎</button>
                                                {boards.filter(b => !b.isHome).length > 1 && (
                                                    <button
                                                        onClick={e => { e.stopPropagation(); onDelete(board.id) }}
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
                    <div style={{ gridColumn: '1 / -1', padding: '40px 0' }}>
                        {searchQuery ? (
                            <EmptyState
                                icon="🔍"
                                title={`找不到「${searchQuery}」相關的白板`}
                                hint="換個關鍵字，或清空搜尋看全部白板。"
                            />
                        ) : (
                            <EmptyState
                                icon="🗂️"
                                title="還沒有白板"
                                hint="白板是放卡片的地方；也可以從既有模板直接建一塊。"
                                actionLabel="＋ 新增白板"
                                onAction={onNew}
                            />
                        )}
                    </div>
                )}
            </div>

            {/* 批次操作列 */}
            {selectionMode && (
                <div style={{
                    position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: T.bgPanel,
                    border: `1px solid ${T.borderLight}`,
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
                            background: selectedIds.size > 0 ? '#f59e0b' : (T.bgApp),
                            color: selectedIds.size > 0 ? 'white' : textMuted,
                            fontSize: 13, cursor: selectedIds.size > 0 ? 'pointer' : 'default', fontWeight: 500,
                        }}
                    >🗄️ 封存選取</button>
                    <button
                        onClick={deleteSelected}
                        disabled={selectedIds.size === 0}
                        style={{
                            padding: '6px 14px', borderRadius: 8, border: 'none',
                            background: selectedIds.size > 0 ? '#ef4444' : (T.bgApp),
                            color: selectedIds.size > 0 ? 'white' : textMuted,
                            fontSize: 13, cursor: selectedIds.size > 0 ? 'pointer' : 'default', fontWeight: 500,
                        }}
                    >🗑️ 刪除選取</button>
                    <button
                        onClick={exitSelectionMode}
                        style={{
                            padding: '6px 14px', borderRadius: 8,
                            border: `1px solid ${T.borderLight}`,
                            background: 'transparent', color: textMuted,
                            fontSize: 13, cursor: 'pointer',
                        }}
                    >取消</button>
                </div>
            )}

            {/* N19 白板模板挑選器 */}
            {pickerOpen && (
                <div
                    onClick={() => setPickerOpen(false)}
                    style={{
                        position: 'absolute', inset: 0, zIndex: 30000,
                        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: 'min(760px, 92vw)', maxHeight: '82vh', display: 'flex', flexDirection: 'column',
                            background: T.bgPanel, borderRadius: 14,
                            border: `1px solid ${T.borderLight}`, boxShadow: '0 12px 48px rgba(0,0,0,0.3)', overflow: 'hidden',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px', borderBottom: `1px solid ${headerBorder}` }}>
                            <span style={{ fontSize: 15, fontWeight: 600, color: textPrimary }}>⧉ 從白板模板新建</span>
                            <span style={{ fontSize: 11, color: countColor, background: countBg, borderRadius: 6, padding: '2px 8px' }}>{templates.length}</span>
                            <div style={{ flex: 1 }} />
                            <button onClick={() => setPickerOpen(false)} title="關閉 (Esc)" style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${inputBorder}`, background: 'transparent', cursor: 'pointer', fontSize: 14, color: countColor, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>✕</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
                            {templates.length === 0 ? (
                                <EmptyState
                                    icon="⧉"
                                    title="還沒有白板模板"
                                    hint="把游標移到任一白板卡片上、按 ⧉，即可把整塊白板存成模板。"
                                />
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                                    {templates.map(t => {
                                        const hovered = hoveredTemplateId === t.id
                                        const renaming = renamingTemplateId === t.id
                                        return (
                                        <div
                                            key={t.id}
                                            onClick={() => { if (!renaming) onCreateFromTemplate(t) }}
                                            title={renaming ? undefined : '用此模板新建白板'}
                                            onMouseEnter={() => setHoveredTemplateId(t.id)}
                                            onMouseLeave={() => setHoveredTemplateId(null)}
                                            style={{
                                                borderRadius: 10, background: cardBg,
                                                border: `1px solid ${hovered && !renaming ? '#2563eb' : cardBorderDefault}`,
                                                boxShadow: hovered && !renaming ? '0 4px 16px rgba(37,99,235,0.18)' : 'none',
                                                cursor: renaming ? 'default' : 'pointer', overflow: 'hidden',
                                                display: 'flex', flexDirection: 'column', position: 'relative',
                                                transition: 'border-color 0.15s, box-shadow 0.15s',
                                            }}
                                        >
                                            <div style={{ width: '100%', aspectRatio: '16/10', background: thumbBg, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderBottom: `1px solid ${thumbBorder}` }}>
                                                {isRasterThumbnail(t.thumbnail) ? (
                                                    <img src={t.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8, boxSizing: 'border-box' }} alt="" />
                                                ) : (
                                                    <span style={{ fontSize: 22, opacity: 0.15 }}>⧉</span>
                                                )}
                                                {hovered && !renaming && (
                                                    <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
                                                        <button onClick={e => startTemplateRename(t, e)} title="重新命名"
                                                            style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.5)', color: 'white', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>✎</button>
                                                        <button onClick={e => removeTemplate(t.id, e)} title="刪除此模板"
                                                            style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.5)', color: 'white', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>✕</button>
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ padding: '8px 10px' }}>
                                                {renaming ? (
                                                    <InlineEdit
                                                        value={t.name}
                                                        onCommit={v => commitTemplateRename(t.id, v)}
                                                        onCancel={() => setRenamingTemplateId(null)}
                                                        style={{ width: '100%', border: 'none', borderBottom: `1.5px solid ${textPrimary}`, fontSize: 13, fontWeight: 500, padding: '1px 0', boxSizing: 'border-box' }}
                                                    />
                                                ) : (
                                                    <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                                                )}
                                                <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>{formatRelativeDate(t.createdAt)}</div>
                                            </div>
                                        </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
