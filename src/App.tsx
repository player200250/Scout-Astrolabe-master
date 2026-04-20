// src/App.tsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
    Tldraw,
    useEditor,
    getSnapshot,
    loadSnapshot,
    SelectTool,
    defaultTools,
    exportToBlob,
} from 'tldraw'
import type { TLEditorSnapshot } from 'tldraw'
import { jsPDF } from 'jspdf'
import { db, saveAutoBackup, type BoardRecord } from './db'
import { formatRelativeDate } from './utils/date'
import { CardShapeUtil, BoardsContext, BacklinksContext } from './components/card-shape/CardShapeUtil'
import { useBacklinks } from './hooks/useBacklinks'
import TldrawToolPanel, { type CardCreators } from './TIdrawToolPanel'
import { SearchPanel } from './SearchPanel'
import { TaskCenter } from './TaskCenter'
import { FilterPanel } from './FilterPanel'
import { getISOWeekKey, getWeekRange } from './WeeklyReview'
import { BackupPanel } from './BackupPanel'
import { ReviewCenter } from './ReviewCenter'
import { useHotkeys } from './Usehotkeys'
import { HotkeyPanel } from './HotkeyPanel'
import { useContextMenu } from './ContextMenu'
import { KnowledgeGraph } from './KnowledgeGraph'
import 'tldraw/tldraw.css'

declare global {
    interface Window {
        electronAPI: {
            saveDocument: (data: string) => void
            loadDocument: () => Promise<any>
            openDocument: () => Promise<string | null>
            openLink: (url: string) => void
        }
    }
}

// db, BoardRecord, BackupRecord — imported from ./db

const HOME_BOARD_ID = 'home_board'
const INBOX_BOARD_ID = 'inbox_board'
const SIDEBAR_WIDTH = 220
const SIDEBAR_COLLAPSED_WIDTH = 40

const generateId = () => `board_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

const isRasterThumbnail = (t: string | null | undefined): t is string =>
    typeof t === 'string' && (
        t.startsWith('data:image/png;base64,') ||
        t.startsWith('data:image/jpeg;base64,') ||
        t.startsWith('data:image/webp;base64,')
    )

const loadAllBoards = async (): Promise<BoardRecord[]> => {
    const boards = await db.table('boards').toArray()

    const svgBoards = boards.filter(b => !isRasterThumbnail(b.thumbnail) && b.thumbnail != null)
    if (svgBoards.length > 0) {
        await Promise.all(svgBoards.map(b => db.table('boards').put({ ...b, thumbnail: null })))
        svgBoards.forEach(b => { b.thumbnail = null })
    }

    let homeBoard = boards.find(b => b.isHome)
    if (!homeBoard) {
        homeBoard = {
            id: HOME_BOARD_ID,
            name: '🏠 主頁',
            snapshot: null,
            thumbnail: null,
            updatedAt: 0,
            isHome: true,
        }
        await db.table('boards').put(homeBoard)
        boards.unshift(homeBoard)
    }

    let inboxBoard = boards.find(b => b.isInbox)
    if (!inboxBoard) {
        inboxBoard = {
            id: INBOX_BOARD_ID,
            name: '📥 收件匣',
            snapshot: null,
            thumbnail: null,
            updatedAt: 0,
            isInbox: true,
        }
        await db.table('boards').put(inboxBoard)
        boards.push(inboxBoard)
    }

    if (boards.filter(b => !b.isHome && !b.isInbox).length === 0) {
        const oldSnapshot = await db.table('snapshots').get('latest')
        const firstBoard: BoardRecord = {
            id: generateId(),
            name: '我的白板',
            snapshot: oldSnapshot?.snapshot ?? null,
            thumbnail: null,
            updatedAt: Date.now(),
        }
        await db.table('boards').put(firstBoard)
        boards.push(firstBoard)
    }

    const home  = boards.filter(b => b.isHome)
    const inbox = boards.filter(b => b.isInbox)
    const rest  = boards.filter(b => !b.isHome && !b.isInbox).sort((a, b) => a.updatedAt - b.updatedAt)
    return [...home, ...inbox, ...rest]
}

const saveBoard = async (board: BoardRecord) => { await db.table('boards').put(board) }
const deleteBoard = async (id: string) => { await db.table('boards').delete(id) }

interface WhiteboardData { snapshot: TLEditorSnapshot | null }

const exportJSON = (snapshot: TLEditorSnapshot, name: string) => {
    const dataStr = JSON.stringify({ snapshot }, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.json`
    a.click()
    URL.revokeObjectURL(url)
}

const importJSON = (file: File, onLoad: (data: WhiteboardData) => void) => {
    const reader = new FileReader()
    reader.onload = e => {
        try { onLoad(JSON.parse(e.target!.result as string)) }
        catch { alert('匯入失敗，檔案格式錯誤') }
    }
    reader.readAsText(file)
}

class CustomSelectTool extends SelectTool {
    static id = 'select' as const
    override onDoubleClick() { return }
}

const customTools = defaultTools.map(tool =>
    tool.id === 'select' ? CustomSelectTool : tool
)

/* --------------------------------------------------------------- BoardOverview */
interface BoardOverviewProps {
    boards: BoardRecord[]
    activeBoardId: string
    onSelect: (id: string) => void
    onNew: () => void
    onRename: (id: string, name: string) => void
    onDelete: (id: string) => void
    onClose: () => void
}

function BoardOverview({ boards, activeBoardId, onSelect, onNew, onRename, onDelete, onClose }: BoardOverviewProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [hoveredId, setHoveredId] = useState<string | null>(null)
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const [archiveFilter, setArchiveFilter] = useState<'all' | 'archived'>('all')

    const filtered = boards
        .filter(b => {
            if (b.isHome || b.isInbox) return false
            if (!b.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
            if (archiveFilter === 'archived') return b.status === 'archived'
            return b.status !== 'archived'
        })
        .sort((a, b) => b.updatedAt - a.updatedAt)

    const formatDate = formatRelativeDate

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

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 20000,
            background: 'rgba(245,245,243,0.97)',
            backdropFilter: 'blur(12px)',
            display: 'flex', flexDirection: 'column',
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 24px', borderBottom: '1px solid #e8e8e6',
                background: 'rgba(255,255,255,0.8)', flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', letterSpacing: '-0.3px' }}>
                        所有白板
                    </span>
                    <span style={{ fontSize: 11, color: '#999', background: '#f0f0ee', borderRadius: 6, padding: '2px 8px' }}>
                        {filtered.length}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 2, background: '#f5f5f3', borderRadius: 8, padding: 3 }}>
                    {(['all', 'archived'] as const).map(v => (
                        <button key={v} onClick={() => setArchiveFilter(v)} style={{
                            padding: '3px 10px', borderRadius: 6, border: 'none',
                            background: archiveFilter === v ? 'white' : 'transparent',
                            color: archiveFilter === v ? '#1a1a1a' : '#888',
                            fontSize: 12, fontWeight: archiveFilter === v ? 600 : 400,
                            cursor: 'pointer',
                            boxShadow: archiveFilter === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        }}>
                            {v === 'all' ? '一般' : '🗄️ 封存'}
                        </button>
                    ))}
                </div>
                <div style={{ flex: 1, maxWidth: 300, marginLeft: 4, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: 13, pointerEvents: 'none' }}>🔍</span>
                    <input
                        autoFocus
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="搜尋白板名稱..."
                        style={{
                            width: '100%', paddingLeft: 30, paddingRight: 12, paddingTop: 6, paddingBottom: 6,
                            borderRadius: 8, border: '1px solid #e0e0de', background: '#fafaf8',
                            fontSize: 13, color: '#1a1a1a', outline: 'none', boxSizing: 'border-box',
                        }}
                    />
                </div>
                <div style={{ flex: 1 }} />
                <button
                    onClick={() => {
                        // 找出同名且 snapshot 為 null 的重複白板（空殘留）
                        const nameCounts: Record<string, BoardRecord[]> = {}
                        boards.filter(b => !b.isHome).forEach(b => {
                            if (!nameCounts[b.name]) nameCounts[b.name] = []
                            nameCounts[b.name].push(b)
                        })
                        const toDelete = Object.values(nameCounts)
                            .flatMap(group => {
                                if (group.length <= 1) return []
                                // 保留有 snapshot 的，或最新的；刪除 snapshot=null 的
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
                        borderRadius: 8, border: '1px solid #e0e0de', background: 'transparent', color: '#888',
                        fontSize: 13, cursor: 'pointer', flexShrink: 0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#fff5f5'; e.currentTarget.style.color = '#e03131'; e.currentTarget.style.borderColor = '#ffccc7' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#e0e0de' }}
                >🧹 清理重複</button>
                <button
                    onClick={() => { onNew(); onClose() }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                        borderRadius: 8, border: 'none', background: '#1a1a1a', color: 'white',
                        fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
                    }}
                >+ 新增白板</button>
                <button
                    onClick={onClose}
                    title="關閉 (Esc)"
                    style={{
                        width: 30, height: 30, borderRadius: 8, border: '1px solid #e0e0de',
                        background: 'transparent', cursor: 'pointer', fontSize: 15, color: '#888',
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
                {filtered.map(board => (
                    <div
                        key={board.id}
                        onMouseEnter={() => setHoveredId(board.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => { onSelect(board.id); onClose() }}
                        style={{
                            borderRadius: 12,
                            border: activeBoardId === board.id ? '2px solid #1a1a1a' : `2px solid ${hoveredId === board.id ? '#d0d0ce' : '#e8e8e6'}`,
                            background: 'white', cursor: 'pointer', overflow: 'hidden',
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                            boxShadow: hoveredId === board.id ? '0 4px 16px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
                            display: 'flex', flexDirection: 'column',
                        }}
                    >
                        <div style={{
                            width: '100%', aspectRatio: '16/10', background: '#f7f7f5',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            overflow: 'hidden', borderBottom: '1px solid #f0f0ee', position: 'relative',
                        }}>
                            {isRasterThumbnail(board.thumbnail) ? (
                                <img src={board.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8, boxSizing: 'border-box' }} alt="" />
                            ) : (
                                <span style={{ fontSize: 24, opacity: 0.15 }}>□</span>
                            )}
                            {activeBoardId === board.id && (
                                <div style={{ position: 'absolute', top: 7, right: 7, background: '#1a1a1a', color: 'white', fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4 }}>使用中</div>
                            )}
                            {childCount(board.id) > 0 && (
                                <div style={{ position: 'absolute', bottom: 7, left: 7, background: 'rgba(0,0,0,0.45)', color: 'white', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>📋 {childCount(board.id)} 個子板</div>
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
                                    style={{ flex: 1, border: 'none', borderBottom: '1.5px solid #1a1a1a', outline: 'none', fontSize: 13, fontWeight: 500, background: 'transparent', padding: '2px 0' }}
                                />
                            ) : (
                                <>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{board.name}</div>
                                        <div style={{ fontSize: 11, color: '#bbb', marginTop: 1 }}>{formatDate(board.updatedAt)}</div>
                                    </div>
                                    {hoveredId === board.id && (
                                        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                                            <button onClick={e => startRename(board, e)} title="重新命名" style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #e0e0de', background: 'white', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, color: '#555' }}>✎</button>
                                            {boards.filter(b => !b.isHome).length > 1 && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); if (confirm(`確定刪除「${board.name}」嗎？`)) onDelete(board.id) }}
                                                    title="刪除"
                                                    style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #e0e0de', background: 'white', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, color: '#e84040' }}
                                                >✕</button>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                ))}

                {filtered.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 0', color: '#ccc', fontSize: 14 }}>
                        {searchQuery ? `找不到「${searchQuery}」相關的白板` : '還沒有白板'}
                    </div>
                )}
            </div>
        </div>
    )
}

/* --------------------------------------------------------------- MoveCardModal */
interface MoveCardModalProps {
    boards: BoardRecord[]
    onSelect: (targetBoardId: string) => void
    onClose: () => void
}

function MoveCardModal({ boards, onSelect, onClose }: MoveCardModalProps) {
    const targets = boards.filter(b => !b.isHome && !b.isInbox && b.status !== 'archived')

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [onClose])

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 99998 }} />
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                background: 'white', borderRadius: 12, width: 300, maxHeight: '60vh',
                boxShadow: '0 12px 40px rgba(0,0,0,0.2)', zIndex: 99999,
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
                <div style={{ padding: '13px 16px', borderBottom: '1px solid #f0f0f0', fontSize: 14, fontWeight: 600, color: '#1a1a1a', flexShrink: 0 }}>
                    📦 移到白板
                </div>
                <div style={{ overflowY: 'auto', padding: '4px 0' }}>
                    {targets.length === 0 ? (
                        <div style={{ padding: '20px', fontSize: 13, color: '#aaa', textAlign: 'center' }}>尚無可移動的白板</div>
                    ) : targets.map(b => (
                        <div
                            key={b.id}
                            onClick={() => { onSelect(b.id); onClose() }}
                            style={{ padding: '9px 16px', fontSize: 13, cursor: 'pointer', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: 8 }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            {isRasterThumbnail(b.thumbnail)
                                ? <img src={b.thumbnail} style={{ width: 24, height: 16, objectFit: 'cover', borderRadius: 3, flexShrink: 0, border: '1px solid #eee' }} alt="" />
                                : <div style={{ width: 24, height: 16, borderRadius: 3, background: '#f0f0f0', border: '1px solid #eee', flexShrink: 0 }} />
                            }
                            {b.name}
                        </div>
                    ))}
                </div>
                <div style={{ padding: '8px 16px', borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
                    <button onClick={onClose} style={{ width: '100%', padding: '7px', borderRadius: 8, border: '1px solid #eee', cursor: 'pointer', fontSize: 13, background: 'transparent' }}>取消</button>
                </div>
            </div>
        </>
    )
}

/* --------------------------------------------------------------- SidebarFooter */
interface SidebarFooterProps {
    onOpenTaskCenter: () => void
    onOpenFilter: () => void
    onOpenReviewCenter: () => void
    onOpenBackup: () => void
    onHotkey: () => void
    onOpenKnowledgeGraph: () => void
}

function SidebarFooter({ onOpenTaskCenter, onOpenFilter, onOpenReviewCenter, onOpenBackup, onHotkey, onOpenKnowledgeGraph }: SidebarFooterProps) {
    const navRow = (icon: string, label: string, onClick: () => void, title?: string) => (
        <button
            onClick={onClick}
            title={title}
            style={{
                width: '100%', height: 34, display: 'flex', alignItems: 'center', gap: 9,
                padding: '0 12px', border: 'none', background: 'transparent', cursor: 'pointer',
                borderRadius: 0, textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.045)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
            <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#2a2a2a' }}>{label}</span>
        </button>
    )

    return (
        <div style={{ borderTop: '1px solid #e8e8e5', flexShrink: 0, paddingBottom: 2 }}>
            {navRow('📔', '復盤中心', onOpenReviewCenter, '復盤中心 (Ctrl+Shift+C)')}
            {navRow('✅', '任務中心', onOpenTaskCenter)}
            {navRow('🕸️', '知識圖譜', onOpenKnowledgeGraph, '知識圖譜 (Ctrl+Shift+G)')}
            <div style={{ display: 'flex', justifyContent: 'space-around', padding: '4px 12px 4px', borderTop: '1px solid #f0f0ee', marginTop: 2 }}>
                {([
                    { icon: '🔍', title: '篩選卡片', fn: onOpenFilter },
                    { icon: '🔒', title: '自動備份', fn: onOpenBackup },
                    { icon: '⌨️', title: '快捷鍵', fn: onHotkey },
                ] as { icon: string; title: string; fn: () => void }[]).map(({ icon, title, fn }) => (
                    <button
                        key={title}
                        onClick={fn}
                        title={title}
                        style={{
                            width: 28, height: 28, borderRadius: 7, border: 'none',
                            background: 'transparent', cursor: 'pointer', fontSize: 14,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >{icon}</button>
                ))}
            </div>
        </div>
    )
}

/* --------------------------------------------------------------- BoardTabBar (右側垂直側邊欄) */
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
}

function BoardTabBar({ boards, activeBoardId, onSwitch, onNew, onRename, onDelete, onSearch, onHotkey, onOpenOverview, onSetJournal, navigationStack, onBack, onSetParent, onSwitchToChild, collapsed, onToggleCollapse, onSetStatus, onOpenTaskCenter, onOpenFilter, onOpenReviewCenter, onOpenBackup, onGoToInbox, onOpenKnowledgeGraph }: BoardTabBarProps) {
    const [hoveredId, setHoveredId] = useState<string | null>(null)
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const [contextMenu, setContextMenu] = useState<{ boardId: string; x: number; y: number } | null>(null)
    const [selectingParentFor, setSelectingParentFor] = useState<string | null>(null)
    const [archivedOpen, setArchivedOpen] = useState(false)
    const [recentOpen, setRecentOpen] = useState(true)
    const [pinnedOpen, setPinnedOpen] = useState(true)
    const [allOpen, setAllOpen] = useState(true)

    const startRename = (board: BoardRecord) => { setRenamingId(board.id); setRenameValue(board.name) }
    const commitRename = (id: string) => { if (renameValue.trim()) onRename(id, renameValue.trim()); setRenamingId(null) }

    const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH

    return (
        <>
            {/* 右側側邊欄主體 */}
            <div style={{
                position: 'fixed',
                top: 0,
                right: 0,
                width: sidebarWidth,
                bottom: 0,
                background: '#f9f9f7',
                backdropFilter: 'blur(8px)',
                borderLeft: '1px solid #e8e8e5',
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
                    borderBottom: '1px solid #e8e8e5',
                    flexShrink: 0,
                    gap: 4,
                }}>
                    {/* 收合按鈕 */}
                    <button
                        onClick={onToggleCollapse}
                        title={collapsed ? '展開側邊欄' : '收合側邊欄'}
                        style={{
                            width: 28, height: 28, borderRadius: 8,
                            border: '1px solid #e8e8e8',
                            background: 'transparent', cursor: 'pointer',
                            fontSize: 13, color: '#888',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 0, flexShrink: 0,
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                        {collapsed ? '‹' : '›'}
                    </button>

                    {/* 展開時：新增 / 總覽 / 搜尋 */}
                    {!collapsed && (
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={onNew} title="新增白板" style={{ width: 28, height: 28, borderRadius: 8, border: '1px dashed #ccc', background: 'transparent', cursor: 'pointer', fontSize: 18, color: '#aaa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >+</button>
                            <button onClick={onOpenOverview} title="所有白板 (Ctrl+Shift+O)" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #eee', background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >⊞</button>
                            <button onClick={onSearch} title="搜尋卡片 (Ctrl+F)" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #eee', background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >🔍</button>
                            <button onClick={onGoToInbox} title="收件匣 (Ctrl+Shift+I)" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #eee', background: activeBoardId === INBOX_BOARD_ID ? '#f0f4ff' : 'transparent', cursor: 'pointer', fontSize: 14, color: activeBoardId === INBOX_BOARD_ID ? '#2563eb' : '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                                onMouseLeave={e => (e.currentTarget.style.background = activeBoardId === INBOX_BOARD_ID ? '#f0f4ff' : 'transparent')}
                            >📥</button>
                        </div>
                    )}
                </div>

                {/* 收合時的圖示按鈕群（核心 5 項） */}
                {collapsed && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0', borderBottom: '1px solid #e8e8e5', flexShrink: 0 }}>
                        <button onClick={onNew} title="新增白板" style={{ width: 28, height: 28, borderRadius: 8, border: '1px dashed #ccc', background: 'transparent', cursor: 'pointer', fontSize: 16, color: '#aaa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>+</button>
                        <button onClick={onOpenOverview} title="所有白板" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #eee', background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>⊞</button>
                        <button onClick={onSearch} title="搜尋" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #eee', background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>🔍</button>
                        <button onClick={onGoToInbox} title="收件匣 (Ctrl+Shift+I)" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #eee', background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>📥</button>
                        <button onClick={onOpenTaskCenter} title="任務中心" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #eee', background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>✅</button>
                        <button onClick={onOpenReviewCenter} title="復盤中心 (Ctrl+Shift+C)" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #eee', background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>📔</button>
                    </div>
                )}

                {/* 麵包屑（展開時才顯示） */}
                {!collapsed && navigationStack.length > 1 && (
                    <div style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, marginBottom: 4 }}>
                            {navigationStack.map((boardId, idx) => {
                                const b = boards.find(b => b.id === boardId)
                                if (!b) return null
                                const isLast = idx === navigationStack.length - 1
                                return (
                                    <React.Fragment key={boardId}>
                                        {idx > 0 && <span style={{ color: '#bbb', fontSize: 10 }}>›</span>}
                                        <span
                                            onClick={() => !isLast && onSwitch(boardId)}
                                            style={{ fontSize: 11, cursor: isLast ? 'default' : 'pointer', color: isLast ? '#1a1a1a' : '#888', fontWeight: isLast ? 600 : 400 }}
                                        >{b.name}</span>
                                    </React.Fragment>
                                )
                            })}
                        </div>
                        <button
                            onClick={onBack}
                            style={{ fontSize: 11, color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
                        >← 返回</button>
                    </div>
                )}

                {/* 白板 Tab 捲動列表 */}
                {(() => {
                    const now = Date.now()
                    const STALE_MS = 14 * 86400000

                    // 分組
                    const topLevel = boards.filter(b => !b.parentId)
                    const pinnedBoards   = topLevel.filter(b => b.status === 'pinned' && !b.isHome && !b.isInbox)
                    const activeBoards   = topLevel.filter(b => b.status !== 'pinned' && b.status !== 'archived' && !b.isHome && !b.isInbox)
                    const archivedBoards = topLevel.filter(b => b.status === 'archived' && !b.isInbox)

                    // 最近使用：非當前、非封存、非釘選、非主頁、非收件匣、有 lastVisitedAt，取前 5
                    const recentBoards = topLevel
                        .filter(b => b.id !== activeBoardId && !b.isHome && !b.isInbox && b.status !== 'archived' && b.status !== 'pinned' && b.lastVisitedAt)
                        .sort((a, b) => (b.lastVisitedAt ?? 0) - (a.lastVisitedAt ?? 0))
                        .slice(0, 5)

                    // 渲染單一 board 列（展開模式，slim row）
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
                                    background: isActive ? 'rgba(37,99,235,0.08)' : isHovered ? 'rgba(0,0,0,0.04)' : 'transparent',
                                    cursor: 'pointer', height: 32,
                                    display: 'flex', alignItems: 'center', gap: 7,
                                    padding: '0 6px 0 8px',
                                    transition: 'background 0.1s',
                                    flexShrink: 0,
                                    opacity: opts?.dimmed ? 0.55 : 1,
                                    borderLeft: isActive ? '2.5px solid #2563eb' : '2.5px solid transparent',
                                }}
                            >
                                {/* 縮圖 */}
                                <div style={{
                                    width: 20, height: 14, borderRadius: 3, overflow: 'hidden',
                                    background: '#e8e8e8', border: '1px solid #ddd', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {isRasterThumbnail(board.thumbnail)
                                        ? <img src={board.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                        : <span style={{ fontSize: 6, color: '#bbb' }}>□</span>
                                    }
                                </div>
                                {/* 名稱 */}
                                {renamingId === board.id ? (
                                    <input
                                        autoFocus value={renameValue}
                                        onChange={e => setRenameValue(e.target.value)}
                                        onBlur={() => commitRename(board.id)}
                                        onKeyDown={e => { if (e.key === 'Enter') commitRename(board.id); if (e.key === 'Escape') setRenamingId(null); e.stopPropagation() }}
                                        onClick={e => e.stopPropagation()}
                                        style={{ flex: 1, border: 'none', borderBottom: '1px solid #333', outline: 'none', fontSize: 12, background: 'transparent', padding: '1px 0', minWidth: 0 }}
                                    />
                                ) : (
                                    <span
                                        onDoubleClick={e => { e.stopPropagation(); startRename(board) }}
                                        style={{
                                            flex: 1, fontSize: 12.5,
                                            color: isActive ? '#1a1a1a' : '#444',
                                            fontWeight: isActive ? 600 : 400,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            userSelect: 'none',
                                        }}
                                    >
                                        {board.status === 'pinned' ? '📌 ' : ''}{board.name}{board.isJournal ? ' 📔' : ''}
                                        {isStale && <span title="超過 14 天未開啟" style={{ marginLeft: 3, fontSize: 9, opacity: 0.4 }}>🕐</span>}
                                    </span>
                                )}
                                {/* 操作按鈕（hover 才顯示） */}
                                {isHovered && !board.isHome && !board.isInbox && (
                                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => startRename(board)}
                                            title="重新命名"
                                            style={{ width: 20, height: 20, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.08)')}
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

                    // 段落標題
                    const SectionHeader = ({ label }: { label: string }) => (
                        <div style={{ padding: '8px 10px 3px', fontSize: 10, fontWeight: 700, color: '#aaa', letterSpacing: '0.7px', textTransform: 'uppercase', userSelect: 'none' }}>
                            {label}
                        </div>
                    )

                    if (collapsed) {
                        // 收合模式：只顯示縮圖
                        return (
                            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '6px 0', scrollbarWidth: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {topLevel.map(board => {
                                    const isActive = activeBoardId === board.id
                                    return (
                                        <div
                                            key={board.id}
                                            onClick={() => onSwitch(board.id)}
                                            title={board.name}
                                            style={{
                                                width: 26, height: 20, margin: '0 auto',
                                                borderRadius: 4, overflow: 'hidden',
                                                border: isActive ? '2px solid #4a6cf7' : '1.5px solid #e0e0e0',
                                                background: '#f5f5f5', cursor: 'pointer', flexShrink: 0,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                opacity: board.status === 'archived' ? 0.5 : 1,
                                            }}
                                        >
                                            {isRasterThumbnail(board.thumbnail)
                                                ? <img src={board.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                                : <span style={{ fontSize: 8, color: '#ccc' }}>□</span>
                                            }
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    }

                    // 可收合段落標題
                    const CollapsibleHeader = ({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) => (
                        <button
                            onClick={onToggle}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                width: '100%', padding: '7px 10px 3px', border: 'none',
                                background: 'transparent', cursor: 'pointer', textAlign: 'left',
                            }}
                        >
                            <span style={{ fontSize: 8, color: '#bbb', transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#aaa', letterSpacing: '0.7px', textTransform: 'uppercase', userSelect: 'none' }}>{label}</span>
                        </button>
                    )

                    const homeBoard  = topLevel.find(b => b.isHome)
                    const inboxBoard = topLevel.find(b => b.isInbox)

                    // 展開模式：分段列表
                    return (
                        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '6px 6px', scrollbarWidth: 'none', display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {/* 主頁（固定在最上方） */}
                            {homeBoard && renderBoardCard(homeBoard)}
                            {/* 收件匣（固定在第二位） */}
                            {inboxBoard && renderBoardCard(inboxBoard)}

                            {/* 最近使用 */}
                            {recentBoards.length > 0 && (
                                <>
                                    <div style={{ height: 1, background: '#e8e8e5', margin: '4px 4px' }} />
                                    <CollapsibleHeader label="最近使用" open={recentOpen} onToggle={() => setRecentOpen(v => !v)} />
                                    {recentOpen && recentBoards.map(b => renderBoardCard(b))}
                                </>
                            )}

                            {/* 釘選 */}
                            {pinnedBoards.length > 0 && (
                                <>
                                    <div style={{ height: 1, background: '#e8e8e5', margin: '4px 4px' }} />
                                    <CollapsibleHeader label="📌 釘選" open={pinnedOpen} onToggle={() => setPinnedOpen(v => !v)} />
                                    {pinnedOpen && pinnedBoards.map(b => renderBoardCard(b))}
                                </>
                            )}

                            {/* 所有白板 */}
                            {activeBoards.filter(b => !b.isHome).length > 0 && (
                                <>
                                    <div style={{ height: 1, background: '#e8e8e5', margin: '4px 4px' }} />
                                    <CollapsibleHeader label="所有白板" open={allOpen} onToggle={() => setAllOpen(v => !v)} />
                                    {allOpen && activeBoards.filter(b => !b.isHome).map(b => renderBoardCard(b))}
                                </>
                            )}

                            {/* 封存 */}
                            {archivedBoards.length > 0 && (
                                <>
                                    <div style={{ height: 1, background: '#e8e8e5', margin: '4px 4px' }} />
                                    <CollapsibleHeader label={`🗄️ 封存 (${archivedBoards.length})`} open={archivedOpen} onToggle={() => setArchivedOpen(v => !v)} />
                                    {archivedOpen && archivedBoards.map(b => renderBoardCard(b, { dimmed: true }))}
                                </>
                            )}
                        </div>
                    )
                })()}

                {/* 底部工具列 */}
                {!collapsed && (
                    <SidebarFooter
                        onOpenTaskCenter={onOpenTaskCenter}
                        onOpenFilter={onOpenFilter}
                        onOpenReviewCenter={onOpenReviewCenter}
                        onOpenBackup={onOpenBackup}
                        onHotkey={onHotkey}
                        onOpenKnowledgeGraph={onOpenKnowledgeGraph}
                    />
                )}
            </div>

            {/* 右鍵選單 */}
            {contextMenu && (() => {
                const targetBoard = boards.find(b => b.id === contextMenu.boardId)
                if (!targetBoard) return null
                return (
                    <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 99998 }} onClick={() => setContextMenu(null)} />
                        <div style={{
                            position: 'fixed',
                            left: contextMenu.x + 180 > window.innerWidth ? contextMenu.x - 180 : contextMenu.x,
                            top: contextMenu.y,
                            background: 'white', borderRadius: 10, padding: '4px 0',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)',
                            zIndex: 99999, minWidth: 180,
                        }}>
                            <div style={{ padding: '4px 12px 6px', fontSize: 11, color: '#aaa', borderBottom: '1px solid #f0f0f0', marginBottom: 4 }}>
                                {targetBoard.name}
                            </div>
                            <div
                                onClick={() => { onSetJournal(contextMenu.boardId, !targetBoard.isJournal); setContextMenu(null) }}
                                style={{ padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#fffbe6')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                {targetBoard.isJournal ? '📔 取消 Journal 白板' : '📔 設為 Journal 白板'}
                            </div>
                            <div style={{ height: 1, background: '#f0f0f0', margin: '4px 0' }} />
                            <div
                                onClick={() => {
                                    onSetStatus(contextMenu.boardId, targetBoard.status === 'pinned' ? 'active' : 'pinned')
                                    setContextMenu(null)
                                }}
                                style={{ padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#fffbe6')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                {targetBoard.status === 'pinned' ? '📌 取消釘選' : '📌 釘選白板'}
                            </div>
                            <div
                                onClick={() => {
                                    onSetStatus(contextMenu.boardId, targetBoard.status === 'archived' ? 'active' : 'archived')
                                    setContextMenu(null)
                                }}
                                style={{ padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                {targetBoard.status === 'archived' ? '↩ 取消封存' : '🗄️ 封存白板'}
                            </div>
                            <div style={{ height: 1, background: '#f0f0f0', margin: '4px 0' }} />
                            <div
                                onClick={() => { setSelectingParentFor(contextMenu.boardId); setContextMenu(null) }}
                                style={{ padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                📂 設為子板...
                            </div>
                            <div style={{ height: 1, background: '#f0f0f0', margin: '4px 0' }} />
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
                                                onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                {renamingId === child.id ? (
                                                    <input
                                                        autoFocus defaultValue={child.name}
                                                        onBlur={() => commitRename(child.id)}
                                                        onKeyDown={e => { if (e.key === 'Enter') commitRename(child.id); if (e.key === 'Escape') setRenamingId(null); e.stopPropagation() }}
                                                        onChange={e => setRenameValue(e.target.value)}
                                                        onClick={e => e.stopPropagation()}
                                                        style={{ flex: 1, border: 'none', borderBottom: '1px solid #333', outline: 'none', fontSize: 13, background: 'transparent', padding: '4px 0' }}
                                                    />
                                                ) : (
                                                    <div
                                                        onClick={() => { onSwitchToChild(child.id); setContextMenu(null) }}
                                                        style={{ flex: 1, padding: '7px 6px 7px 0', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                                                    >
                                                        <span style={{ color: '#aaa', fontSize: 11 }}>{depth > 0 ? '└' : '📋'}</span>
                                                        {child.name}
                                                    </div>
                                                )}
                                                <button onClick={e => { e.stopPropagation(); startRename(child) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 11, padding: '2px 4px', borderRadius: 4, flexShrink: 0 }}>✏️</button>
                                                <button onClick={e => { e.stopPropagation(); onSetParent(child.id, null); setContextMenu(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 11, padding: '2px 4px', borderRadius: 4, flexShrink: 0, whiteSpace: 'nowrap' }}>↑主板</button>
                                                <button onClick={e => { e.stopPropagation(); if (confirm(`確定刪除「${child.name}」嗎？`)) { onDelete(child.id); setContextMenu(null) } }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 14, padding: '2px 4px', borderRadius: 4, flexShrink: 0 }}>×</button>
                                            </div>
                                            {renderChildren(child.id, depth + 1)}
                                        </React.Fragment>
                                    ))
                                }
                                return (
                                    <>
                                        <div style={{ height: 1, background: '#e8e8e5', margin: '4px 4px' }} />
                                        <div style={{ padding: '4px 14px 2px', fontSize: 11, color: '#aaa' }}>子板</div>
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
                return (
                    <>
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 99998 }} onClick={() => setSelectingParentFor(null)} />
                        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 14, padding: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', zIndex: 99999, minWidth: 280 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>設為子板</div>
                            <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>將「{target?.name}」設為哪個白板的子板？</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {tree.map(({ board: b, depth }) => (
                                    <div key={b.id} onClick={() => { onSetParent(selectingParentFor, b.id); setSelectingParentFor(null) }} style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid #eee', fontSize: 13, marginLeft: depth * 16, display: 'flex', alignItems: 'center', gap: 6 }} onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                        {depth > 0 && <span style={{ color: '#ccc', fontSize: 11 }}>└</span>}
                                        {b.name}
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => setSelectingParentFor(null)} style={{ marginTop: 12, width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #eee', cursor: 'pointer', fontSize: 13 }}>取消</button>
                        </div>
                    </>
                )
            })()}
        </>
    )
}

/* --------------------------------------------------------------- Whiteboard */
interface WhiteboardProps {
    board: BoardRecord
    boards: BoardRecord[]
    onSaveBoard: (snapshot: TLEditorSnapshot, thumbnail: string | null) => void
    jumpRef: React.MutableRefObject<((shapeId: string, x: number, y: number) => void) | null>
    onOpenSearch: () => void
    onOpenHotkey: () => void
    onCreateBoard: (name: string) => BoardRecord
    onSwitchBoard: (id: string) => void
    sidebarWidth: number
    isInboxBoard: boolean
    onMoveCard: (shapeId: string) => void
}

function Whiteboard({ board, boards, onSaveBoard, jumpRef, onOpenSearch, onOpenHotkey, onCreateBoard, onSwitchBoard, sidebarWidth, isInboxBoard, onMoveCard }: WhiteboardProps) {
    const boardInfos = boards.map(b => ({ id: b.id, name: b.name, thumbnail: b.thumbnail }))
    const { forwardLinks, backlinks } = useBacklinks(boards)
    const backlinksValue = useMemo(() => ({
        forwardLinks,
        backlinks,
        boardNames: boards.filter(b => !b.isHome).map(b => b.name),
        currentBoardName: board.name,
    }), [forwardLinks, backlinks, boards, board.name])

    return (
        <div
            onDoubleClickCapture={e => { e.stopPropagation(); e.preventDefault() }}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: sidebarWidth,
                bottom: 0,
                transition: 'right 0.2s cubic-bezier(0.4,0,0.2,1)',
            }}
        >
            <BacklinksContext.Provider value={backlinksValue}>
                <BoardsContext.Provider value={boardInfos}>
                    <Tldraw hideUi={true} tools={customTools} shapeUtils={[CardShapeUtil]}>
                        <WhiteboardTools
                            board={board}
                            boards={boards}
                            onSaveBoard={onSaveBoard}
                            jumpRef={jumpRef}
                            onOpenSearch={onOpenSearch}
                            onOpenHotkey={onOpenHotkey}
                            onCreateBoard={onCreateBoard}
                            onSwitchBoard={onSwitchBoard}
                            isInboxBoard={isInboxBoard}
                            onMoveCard={onMoveCard}
                        />
                    </Tldraw>
                </BoardsContext.Provider>
            </BacklinksContext.Provider>
        </div>
    )
}

/* --------------------------------------------------------------- WhiteboardTools */
interface WhiteboardToolsProps {
    board: BoardRecord
    onSaveBoard: (snapshot: TLEditorSnapshot, thumbnail: string | null) => void
    jumpRef: React.MutableRefObject<((shapeId: string, x: number, y: number) => void) | null>
    onOpenSearch: () => void
    onOpenHotkey: () => void
    boards: BoardRecord[]
    onCreateBoard: (name: string) => BoardRecord
    onSwitchBoard: (id: string) => void
    isInboxBoard: boolean
    onMoveCard: (shapeId: string) => void
}

const exportBtnStyle: React.CSSProperties = {
    padding: '5px 11px',
    fontSize: 12,
    fontWeight: 500,
    color: '#333',
    background: 'rgba(255,255,255,0.92)',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    cursor: 'pointer',
    backdropFilter: 'blur(4px)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    transition: 'background 0.15s',
    whiteSpace: 'nowrap' as const,
}

function WhiteboardTools({ board, onSaveBoard, jumpRef, onOpenSearch, onOpenHotkey, boards, onCreateBoard, onSwitchBoard, isInboxBoard, onMoveCard }: WhiteboardToolsProps) {
    const editor = useEditor()
    const initialized = useRef(false)
    const imageInputRef = useRef<HTMLInputElement>(null)
    const jsonInputRef = useRef<HTMLInputElement>(null)

    const createTextCard = useCallback((x?: number, y?: number) => {
        editor.createShape({ type: 'card', x, y, props: { type: 'text', text: '', image: null, blobUrl: null, todos: [], url: '', state: 'idle', w: 240, h: 160 } })
    }, [editor])

    const createTodoCard = useCallback((x?: number, y?: number) => {
        editor.createShape({ type: 'card', x, y, props: { type: 'todo', text: '', image: null, blobUrl: null, todos: [{ id: `todo_${Date.now()}`, text: '新任務', checked: false }], url: null, state: 'idle', w: 260, h: 200 } })
    }, [editor])

    const createLinkCard = useCallback((x?: number, y?: number) => {
        editor.createShape({ type: 'card', x, y, props: { type: 'link', text: '', image: null, blobUrl: null, todos: [], url: 'https://example.com', state: 'idle', w: 260, h: 120 } })
    }, [editor])

    const createImageCard = useCallback((imgBase64: string) => {
        editor.createShape({ type: 'card', props: { type: 'image', text: '', image: imgBase64, blobUrl: null, todos: [], url: '', state: 'idle', w: 300, h: 200 } })
    }, [editor])

    const createBoardCard = useCallback((x?: number, y?: number) => {
        const newBoard = onCreateBoard(`子白板 ${boards.length + 1}`)
        editor.createShape({
            type: 'card', x, y,
            props: { type: 'board', text: newBoard.name, image: null, blobUrl: null, todos: [], url: '', linkEmbedUrl: null, linkedBoardId: newBoard.id, state: 'idle', color: 'none', w: 280, h: 200 }
        })
    }, [editor, onCreateBoard, boards.length])

    const createColumnCard = useCallback((x?: number, y?: number) => {
        const center = editor.getViewportScreenCenter()
        const pageCenter = editor.screenToPage(center)
        editor.createShape({ type: 'frame', x: x ?? pageCenter.x - 160, y: y ?? pageCenter.y - 240, props: { w: 320, h: 480, name: '欄位' } })
    }, [editor])

    const openImageInput = useCallback(() => imageInputRef.current?.click(), [])

    const cardCreators: CardCreators = useMemo(() => ({
        createTextCard: () => createTextCard(),
        createImageCard,
        createTodoCard: () => createTodoCard(),
        createLinkCard: () => createLinkCard(),
        createBoardCard: () => createBoardCard(),
        createColumnCard: () => createColumnCard(),
        openImageInput,
    }), [createTextCard, createImageCard, createTodoCard, createLinkCard, createBoardCard, createColumnCard, openImageInput])

    useEffect(() => {
        const handleBoardEnter = (e: CustomEvent) => {
            const { linkedBoardId } = e.detail
            if (linkedBoardId) onSwitchBoard(linkedBoardId)
        }
        window.addEventListener('board-card-enter' as any, handleBoardEnter)
        return () => window.removeEventListener('board-card-enter' as any, handleBoardEnter)
    }, [onSwitchBoard])

    useEffect(() => {
        const handler = (e: CustomEvent) => {
            const { deletedBoardId } = e.detail
            const orphans = editor.getCurrentPageShapes()
                .filter(s => (s.props as any).type === 'board' && (s.props as any).linkedBoardId === deletedBoardId)
                .map(s => s.id)
            if (orphans.length > 0) editor.deleteShapes(orphans as any)
        }
        window.addEventListener('cleanup-orphan-board-cards' as any, handler)
        return () => window.removeEventListener('cleanup-orphan-board-cards' as any, handler)
    }, [editor])

    // jump-to-card：從 BacklinksPanel 觸發的跳轉
    useEffect(() => {
        const handler = (e: CustomEvent) => {
            const { boardId, shapeId, x, y, targetName } = e.detail ?? {}

            if (targetName) {
                // [[BoardName]] → 按白板名稱導航
                const target = boards.find(b => b.name.toLowerCase() === (targetName as string).toLowerCase())
                if (target) onSwitchBoard(target.id)
                return
            }

            if (!shapeId) return

            if (!boardId || boardId === board.id) {
                // 同一張白板直接跳
                jumpRef.current?.(shapeId, x ?? 0, y ?? 0)
            } else {
                // 跨板：先切換，350ms 後跳轉
                onSwitchBoard(boardId)
                setTimeout(() => jumpRef.current?.(shapeId, x ?? 0, y ?? 0), 350)
            }
        }
        window.addEventListener('jump-to-card' as any, handler)
        return () => window.removeEventListener('jump-to-card' as any, handler)
    }, [boards, board.id, onSwitchBoard, jumpRef])

    useEffect(() => {
        const handler = (e: CustomEvent) => {
            const { targetBoardId, linkedBoardId, boardName } = e.detail
            if (targetBoardId !== board.id) return
            const center = editor.getViewportScreenCenter()
            const pageCenter = editor.screenToPage(center)
            editor.createShape({
                type: 'card', x: pageCenter.x - 140, y: pageCenter.y - 100,
                props: { type: 'board', text: boardName, image: null, blobUrl: null, todos: [], url: '', linkEmbedUrl: null, linkedBoardId, state: 'idle', color: 'none', w: 280, h: 200 }
            })
        }
        window.addEventListener('create-board-card-on' as any, handler)
        return () => window.removeEventListener('create-board-card-on' as any, handler)
    }, [board.id, editor])

    const { menuElement } = useContextMenu({ editor, createTextCard, createTodoCard, createLinkCard, openImageInput, isInboxBoard, onMoveCard })

    // 收件匣移卡：收到 App 層指令後從 editor 刪除 shape
    useEffect(() => {
        const h = (e: CustomEvent) => { if (editor) editor.deleteShapes([e.detail.shapeId]) }
        window.addEventListener('delete-shape-from-editor', h as EventListener)
        return () => window.removeEventListener('delete-shape-from-editor', h as EventListener)
    }, [editor])

    useHotkeys(editor, {
        createTextCard: () => createTextCard(),
        createTodoCard: () => createTodoCard(),
        createLinkCard: () => createLinkCard(),
        openImageInput,
        openSearch: onOpenSearch,
        openHotkeyPanel: onOpenHotkey,
    })

    useEffect(() => {
        const handlePaste = async (e: ClipboardEvent) => {
            const target = e.target as HTMLElement
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
            const items = e.clipboardData?.items
            if (!items) return

            for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault()
                    const file = item.getAsFile()
                    if (!file) continue
                    const reader = new FileReader()
                    reader.onload = () => {
                        const base64 = reader.result as string
                        const center = editor.getViewportScreenCenter()
                        const pagePoint = editor.screenToPage(center)
                        editor.createShape({ type: 'card', x: pagePoint.x - 150, y: pagePoint.y - 100, props: { type: 'image', text: '', image: base64, blobUrl: null, todos: [], url: '', state: 'idle', w: 300, h: 200 } })
                    }
                    reader.readAsDataURL(file)
                    return
                }
            }

            const htmlItem = Array.from(items).find(i => i.type === 'text/html')
            if (htmlItem) {
                htmlItem.getAsString(async (html) => {
                    const match = html.match(/<img[^>]+src=["']([^"']+)["']/)
                    if (!match) return
                    const imgUrl = match[1]
                    try {
                        const res = await fetch(imgUrl)
                        const blob = await res.blob()
                        const reader = new FileReader()
                        reader.onload = () => {
                            const base64 = reader.result as string
                            const center = editor.getViewportScreenCenter()
                            const pagePoint = editor.screenToPage(center)
                            editor.createShape({ type: 'card', x: pagePoint.x - 150, y: pagePoint.y - 100, props: { type: 'image', text: '', image: base64, blobUrl: null, todos: [], url: '', state: 'idle', w: 300, h: 200 } })
                        }
                        reader.readAsDataURL(blob)
                    } catch {
                        const center = editor.getViewportScreenCenter()
                        const pagePoint = editor.screenToPage(center)
                        editor.createShape({ type: 'card', x: pagePoint.x - 150, y: pagePoint.y - 100, props: { type: 'image', text: '', image: imgUrl, blobUrl: null, todos: [], url: '', state: 'idle', w: 300, h: 200 } })
                    }
                })
                return
            }

            const textItem = Array.from(items).find(i => i.type === 'text/plain')
            if (textItem) {
                textItem.getAsString(text => {
                    const trimmed = text.trim()
                    try {
                        new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
                        const center = editor.getViewportScreenCenter()
                        const pagePoint = editor.screenToPage(center)
                        editor.createShape({ type: 'card', x: pagePoint.x - 130, y: pagePoint.y - 60, props: { type: 'link', text: '', image: null, blobUrl: null, todos: [], url: trimmed, state: 'idle', w: 260, h: 120 } })
                    } catch { }
                })
            }
        }
        window.addEventListener('paste', handlePaste)
        return () => window.removeEventListener('paste', handlePaste)
    }, [editor, createImageCard])

    const exportPNG = useCallback(async (selectedOnly: boolean) => {
        const allIds = Array.from(editor.getCurrentPageShapeIds())
        const selectedIds = editor.getSelectedShapeIds()
        const ids = selectedOnly ? Array.from(selectedIds) : allIds
        if (ids.length === 0) { alert(selectedOnly ? '請先選取卡片' : '白板沒有卡片'); return }
        const blob = await exportToBlob({ editor, ids: ids as any, format: 'png', opts: { background: true, scale: 2 } })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `${board.name}.png`; a.click()
        URL.revokeObjectURL(url)
    }, [editor, board.name])

    const exportPDF = useCallback(async (selectedOnly: boolean) => {
        const allIds = Array.from(editor.getCurrentPageShapeIds())
        const selectedIds = editor.getSelectedShapeIds()
        const ids = selectedOnly ? Array.from(selectedIds) : allIds
        if (ids.length === 0) { alert(selectedOnly ? '請先選取卡片' : '白板沒有卡片'); return }
        const blob = await exportToBlob({ editor, ids: ids as any, format: 'png', opts: { background: true, scale: 2 } })
        const imgUrl = URL.createObjectURL(blob)
        const img = new Image()
        img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.width; canvas.height = img.height
            const ctx = canvas.getContext('2d')!
            ctx.drawImage(img, 0, 0)
            const imgData = canvas.toDataURL('image/png')
            const pdf = new jsPDF({
                orientation: img.width > img.height ? 'landscape' : 'portrait',
                unit: 'px',
                format: [img.width / 2, img.height / 2],
            })
            pdf.addImage(imgData, 'PNG', 0, 0, img.width / 2, img.height / 2)
            pdf.save(`${board.name}.pdf`)
            URL.revokeObjectURL(imgUrl)
        }
        img.src = imgUrl
    }, [editor, board.name])

    const [showExportMenu, setShowExportMenu] = useState(false)

    useEffect(() => {
        if (!editor || initialized.current) return
        initialized.current = true
        if (board.snapshot) loadSnapshot(editor.store, board.snapshot)

        setTimeout(() => {
            const targetBoards = board.isHome
                ? boards.filter(b => !b.parentId && !b.isHome)
                : boards.filter(b => b.parentId === board.id)

            if (targetBoards.length > 0) {
                const existingLinkedIds = new Set(
                    editor.getCurrentPageShapes()
                        .filter(s => (s.props as any).type === 'board')
                        .map(s => (s.props as any).linkedBoardId)
                        .filter(Boolean)
                )
                const missing = targetBoards.filter(b => !existingLinkedIds.has(b.id))
                if (missing.length > 0) {
                    const center = editor.getViewportScreenCenter()
                    const pageCenter = editor.screenToPage(center)
                    missing.forEach((child, idx) => {
                        editor.createShape({
                            type: 'card',
                            x: pageCenter.x - 140 + (idx % 4) * 300,
                            y: pageCenter.y - 100 + Math.floor(idx / 4) * 240,
                            props: { type: 'board', text: child.name, image: null, blobUrl: null, todos: [], url: '', linkEmbedUrl: null, linkedBoardId: child.id, state: 'idle', color: 'none', w: 280, h: 200 }
                        })
                    })
                }
            }

            if (board.isJournal) {
                const today = new Date()
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
                const weekDay = ['日', '一', '二', '三', '四', '五', '六'][today.getDay()]
                const todayLabel = `${today.getMonth() + 1}/${today.getDate()}（${weekDay}）`
                const alreadyExists = editor.getCurrentPageShapes().some(s => (s.props as any).journalDate === todayStr)
                if (!alreadyExists) {
                    const allShapes = editor.getCurrentPageShapes()
                    const maxX = allShapes.length > 0 ? Math.max(...allShapes.map(s => s.x + ((s.props as any).w ?? 240))) + 40 : 100
                    const journalText = `<h2>${todayLabel}</h2><p><strong>今天做了什麼</strong></p><p></p><p><strong>學到什麼（在哪個白板）</strong></p><p></p><p><strong>計畫/待辦</strong></p><p></p><p><strong>卡住的地方</strong></p><p></p><p><strong>明天先做</strong></p><p></p>`
                    editor.createShape({ type: 'card', x: maxX, y: 100, props: { type: 'journal', text: journalText, image: null, blobUrl: null, todos: [], url: '', linkEmbedUrl: null, journalDate: todayStr, state: 'idle', color: 'yellow', w: 280, h: 380 } })
                    editor.createShape({ type: 'card', x: maxX + 320, y: 100, props: { type: 'todo', text: `${todayLabel} 計畫`, image: null, blobUrl: null, todos: [{ id: `todo_${Date.now()}`, text: '今日任務', checked: false }], url: null, linkEmbedUrl: null, journalDate: todayStr, state: 'idle', color: 'blue', w: 260, h: 200 } })
                }

                // 週回顧卡片：每週建立一次，以 week-YYYY-WW 為識別
                const weekKey = getISOWeekKey(today)
                const weeklyExists = editor.getCurrentPageShapes().some(s => (s.props as any).journalDate === weekKey)
                if (!weeklyExists) {
                    const { start: weekStart, end: weekEnd, weekNum } = getWeekRange(today)
                    const allShapesNow = editor.getCurrentPageShapes()
                    const minX = allShapesNow.length > 0
                        ? Math.min(...allShapesNow.map(s => s.x)) - 360
                        : 100
                    const sLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`
                    const eLabel = `${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`
                    const weeklyText = `<h2>第 ${weekNum} 週回顧（${sLabel} - ${eLabel}）</h2><p><strong>這週完成了什麼</strong></p><p></p><p><strong>這週學到什麼</strong></p><p></p><p><strong>卡住的地方 &amp; 解法</strong></p><p></p><p><strong>下週目標（3 件事）</strong></p><p></p><p><strong>需要跟進的白板</strong></p><p></p>`
                    editor.createShape({
                        type: 'card',
                        x: minX,
                        y: 100,
                        props: {
                            type: 'journal',
                            text: weeklyText,
                            image: null, blobUrl: null, todos: [], url: '', linkEmbedUrl: null,
                            journalDate: weekKey,
                            state: 'idle',
                            color: 'purple',
                            w: 300, h: 420,
                        },
                    })
                }
            }
        }, 300)
    }, [editor, board])

    useEffect(() => {
        jumpRef.current = (shapeId: string, x: number, y: number) => {
            try {
                const shape = editor.getShape(shapeId as any)
                if (shape) { editor.select(shapeId as any); editor.zoomToSelection({ animation: { duration: 300 } }) }
                else { editor.setCamera({ x: -x + window.innerWidth / 2, y: -y + window.innerHeight / 2, z: 1 }, { animation: { duration: 300 } }) }
            } catch {
                editor.setCamera({ x: -x + window.innerWidth / 2, y: -y + window.innerHeight / 2, z: 1 }, { animation: { duration: 300 } })
            }
        }
        return () => { jumpRef.current = null }
    }, [editor, jumpRef])

    // 🔧 修 #5：timer 用 useRef 存放，避免 unmount 後 closure 裡的舊 timer 繼續觸發
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const generateThumbnail = useCallback(async (): Promise<string | null> => {
        try {
            const shapeIds = [...editor.getCurrentPageShapeIds()]
            if (shapeIds.length === 0) return null
            const blob = await exportToBlob({ editor, ids: shapeIds as any, format: 'png', opts: { background: true, scale: 0.15 } })
            return await new Promise<string | null>(resolve => {
                const reader = new FileReader()
                reader.onload = () => resolve(reader.result as string)
                reader.onerror = () => resolve(null)
                reader.readAsDataURL(blob)
            })
        } catch { return null }
    }, [editor])

    const saveDebounce = useCallback((snap: TLEditorSnapshot) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(async () => {
            const thumbnail = await generateThumbnail()
            onSaveBoard(snap, thumbnail)
            saveTimerRef.current = null
        }, 500)
    }, [generateThumbnail, onSaveBoard])

    useEffect(() => {
        if (!editor) return
        const cleanup = editor.store.listen(() => {
            saveDebounce(getSnapshot(editor.store) as TLEditorSnapshot)
        }, { scope: 'document' })
        // 🔧 修 #5：unmount 時清除還在排隊的 timer
        return () => {
            cleanup()
            if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
        }
    }, [editor, saveDebounce])

    return (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <TldrawToolPanel {...cardCreators} />
            <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6, pointerEvents: 'auto', zIndex: 100 }}>
                {/* @ts-ignore */}
                {window.electronAPI && (
                    <button
                        onClick={() => window.electronAPI.saveDocument(JSON.stringify({ snapshot: getSnapshot(editor.store) }))}
                        style={exportBtnStyle}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.92)')}
                    >儲存</button>
                )}
                <button
                    onClick={() => exportJSON(getSnapshot(editor.store) as TLEditorSnapshot, board.name)}
                    style={exportBtnStyle}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.92)')}
                >匯出 JSON</button>
                <button
                    onClick={() => jsonInputRef.current?.click()}
                    style={exportBtnStyle}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.92)')}
                >匯入 JSON</button>
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowExportMenu(v => !v)}
                        style={{ ...exportBtnStyle, display: 'flex', alignItems: 'center', gap: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.92)')}
                    >匯出圖片 ▾</button>
                    {showExportMenu && (
                        <div style={{ position: 'absolute', top: '110%', right: 0, background: 'white', borderRadius: 10, padding: '4px 0', boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)', minWidth: 180, zIndex: 9999, whiteSpace: 'nowrap' }} onMouseLeave={() => setShowExportMenu(false)}>
                            {[
                                { label: '🖼️ 整個白板 → PNG', fn: () => exportPNG(false) },
                                { label: '🖼️ 選取卡片 → PNG', fn: () => exportPNG(true) },
                                { label: '📄 整個白板 → PDF', fn: () => exportPDF(false) },
                                { label: '📄 選取卡片 → PDF', fn: () => exportPDF(true) },
                            ].map(({ label, fn }) => (
                                <div key={label} onClick={() => { fn(); setShowExportMenu(false) }} style={{ padding: '8px 16px', cursor: 'pointer', fontSize: 13 }} onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{label}</div>
                            ))}
                        </div>
                    )}
                </div>
                {/* 隱藏的 JSON import input，由「匯入 JSON」按鈕觸發 */}
                <input ref={jsonInputRef} type="file" accept="application/json" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) importJSON(f, d => loadSnapshot(editor.store, d.snapshot!)); e.target.value = '' }}
                />
            </div>
            <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => {
                    const file = e.target.files?.[0]; if (!file) return
                    const reader = new FileReader()
                    reader.onload = () => createImageCard(reader.result as string)
                    reader.readAsDataURL(file)
                    e.target.value = ''
                }}
            />
            <div style={{ pointerEvents: 'auto' }}>{menuElement}</div>
        </div>
    )
}

/* --------------------------------------------------------------- App */
export default function App() {
    const [boards, setBoards] = useState<BoardRecord[]>([])
    const [activeBoardId, setActiveBoardId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [searchOpen, setSearchOpen] = useState(false)
    const [hotkeyOpen, setHotkeyOpen] = useState(false)
    const [overviewOpen, setOverviewOpen] = useState(false)
    const [taskCenterOpen, setTaskCenterOpen] = useState(false)
    const [filterOpen, setFilterOpen] = useState(false)
    const [reviewCenterOpen, setReviewCenterOpen] = useState(false)
    const [backupPanelOpen, setBackupPanelOpen] = useState(false)
    const [movingCardShapeId, setMovingCardShapeId] = useState<string | null>(null)
    const [knowledgeGraphOpen, setKnowledgeGraphOpen] = useState(false)
    const [navigationStack, setNavigationStack] = useState<string[]>([])
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        try { return localStorage.getItem('sidebar-collapsed') === 'true' } catch { return false }
    })
    const jumpRef = useRef<((shapeId: string, x: number, y: number) => void) | null>(null)
    const lastBackupRef = useRef<number>(0)
    const BACKUP_THROTTLE_MS = 5 * 60 * 1000

    const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH

    const handleToggleCollapse = useCallback(() => {
        setSidebarCollapsed(prev => {
            const next = !prev
            try { localStorage.setItem('sidebar-collapsed', String(next)) } catch { }
            return next
        })
    }, [])

    const triggerAutoBackup = useCallback((currentBoards: BoardRecord[]) => {
        const now = Date.now()
        if (now - lastBackupRef.current < BACKUP_THROTTLE_MS) return
        lastBackupRef.current = now
        saveAutoBackup(currentBoards).catch(console.error)
    }, [BACKUP_THROTTLE_MS])

    // 備份 on app hide（關閉分頁、切換到其他程式）
    useEffect(() => {
        const handler = () => {
            if (document.visibilityState === 'hidden' && boards.length > 0) {
                saveAutoBackup(boards).catch(console.error)
            }
        }
        document.addEventListener('visibilitychange', handler)
        return () => document.removeEventListener('visibilitychange', handler)
    }, [boards])

    useEffect(() => {
        navigator.storage?.persist?.().then(granted => {
            if (!granted) console.warn('[Storage] 持久化未授權，資料可能被清除')
        })
        loadAllBoards().then(loaded => {
            setBoards(loaded)
            const firstId = loaded[0]?.id ?? null
            setActiveBoardId(firstId)
            if (firstId) setNavigationStack([firstId])
            setLoading(false)
        })
    }, [])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
                e.preventDefault()
                setOverviewOpen(prev => !prev)
            }
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
                e.preventDefault()
                setReviewCenterOpen(prev => !prev)
            }
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
                e.preventDefault()
                setActiveBoardId(INBOX_BOARD_ID)
                setNavigationStack([INBOX_BOARD_ID])
            }
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
                e.preventDefault()
                setKnowledgeGraphOpen(prev => !prev)
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [])

    const activeBoard = boards.find(b => b.id === activeBoardId) ?? null

    const handleSaveBoard = useCallback((snapshot: TLEditorSnapshot, thumbnail: string | null) => {
        if (!activeBoardId) return
        setBoards(prev => prev.map(b => {
            if (b.id !== activeBoardId) return b
            const updated = { ...b, snapshot, thumbnail, updatedAt: Date.now() }
            saveBoard(updated)
            return updated
        }))
    }, [activeBoardId])

    const uniqueName = useCallback((base: string): string => {
        const existing = new Set(boards.map(b => b.name))
        if (!existing.has(base)) return base
        let n = 2
        while (existing.has(`${base} (${n})`)) n++
        return `${base} (${n})`
    }, [boards])

    const handleCreateBoard = useCallback((name: string, parentId?: string): BoardRecord => {
        const safeName = uniqueName(name)
        const newBoard: BoardRecord = { id: generateId(), name: safeName, snapshot: null, thumbnail: null, updatedAt: Date.now(), parentId: parentId ?? null }
        saveBoard(newBoard)
        setBoards(prev => [...prev, newBoard])
        return newBoard
    }, [uniqueName])

    const handleSwitch = useCallback((id: string) => {
        if (id !== activeBoardId) {
            triggerAutoBackup(boards)
            setActiveBoardId(id)
            setNavigationStack([id])
            setBoards(prev => prev.map(b => {
                if (b.id !== id) return b
                const updated = { ...b, lastVisitedAt: Date.now() }
                saveBoard(updated)
                return updated
            }))
        }
    }, [activeBoardId, boards, triggerAutoBackup])

    const handleSwitchToChild = useCallback((childId: string) => {
        setActiveBoardId(childId)
        setNavigationStack(prev => {
            const idx = prev.indexOf(childId)
            if (idx >= 0) return prev.slice(0, idx + 1)
            return [...prev, childId]
        })
        setBoards(prev => prev.map(b => {
            if (b.id !== childId) return b
            const updated = { ...b, lastVisitedAt: Date.now() }
            saveBoard(updated)
            return updated
        }))
    }, [])

    const handleSetParent = useCallback((boardId: string, parentId: string | null) => {
        const childBoard = boards.find(b => b.id === boardId)
        setBoards(prev => prev.map(b => {
            if (b.id !== boardId) return b
            const updated = { ...b, parentId }
            saveBoard(updated)
            return updated
        }))
        if (parentId && childBoard) {
            setActiveBoardId(parentId)
            setNavigationStack([parentId])
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('create-board-card-on', { detail: { targetBoardId: parentId, linkedBoardId: boardId, boardName: childBoard.name } }))
            }, 400)
        }
        if (activeBoardId === boardId && parentId === null) setNavigationStack([boardId])
    }, [activeBoardId, boards])

    const handleBack = useCallback(() => {
        setNavigationStack(prev => {
            if (prev.length <= 1) return prev
            const newStack = prev.slice(0, -1)
            setActiveBoardId(newStack[newStack.length - 1])
            return newStack
        })
    }, [])

    const handleNew = useCallback(() => {
        const name = uniqueName(`白板 ${boards.length + 1}`)
        const newBoard: BoardRecord = { id: generateId(), name, snapshot: null, thumbnail: null, updatedAt: Date.now() }
        saveBoard(newBoard)
        setBoards(prev => [...prev, newBoard])
        setActiveBoardId(newBoard.id)
        setNavigationStack([newBoard.id])
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('create-board-card-on', { detail: { targetBoardId: HOME_BOARD_ID, linkedBoardId: newBoard.id, boardName: newBoard.name } }))
        }, 400)
    }, [boards.length, uniqueName])

    const handleRename = useCallback((id: string, name: string) => {
        setBoards(prev => prev.map(b => { if (b.id !== id) return b; const u = { ...b, name }; saveBoard(u); return u }))
    }, [])

    const handleDelete = useCallback((id: string) => {
        deleteBoard(id)
        // 🔧 修 #1：同時將孤兒子板升為主板，避免資料遺失
        setBoards(prev => {
            const orphanChildren = prev.filter(b => b.parentId === id)
            orphanChildren.forEach(b => saveBoard({ ...b, parentId: null }))

            const next = prev
                .filter(b => b.id !== id)
                .map(b => b.parentId === id ? { ...b, parentId: null } : b)

            if (activeBoardId === id) setActiveBoardId(next[0]?.id ?? null)

            const cleaned = next.map(b => {
                if (!b.snapshot) return b
                const store = (b.snapshot as any).document?.store
                if (!store) return b
                const orphanIds = Object.keys(store).filter(shapeId => {
                    const s = store[shapeId]
                    return s.typeName === 'shape' && s.type === 'card' && s.props?.type === 'board' && s.props?.linkedBoardId === id
                })
                if (orphanIds.length === 0) return b
                const newStore = { ...store }
                orphanIds.forEach(shapeId => { delete newStore[shapeId] })
                const updated = { ...b, snapshot: { ...(b.snapshot as any), document: { ...(b.snapshot as any).document, store: newStore } } as TLEditorSnapshot }
                saveBoard(updated)
                return updated
            })

            window.dispatchEvent(new CustomEvent('cleanup-orphan-board-cards', { detail: { deletedBoardId: id } }))
            return cleaned
        })
    }, [activeBoardId])

    const handleJump = useCallback((boardId: string, shapeId: string, x: number, y: number) => {
        setSearchOpen(false)
        if (boardId !== activeBoardId) {
            setActiveBoardId(boardId)
            setTimeout(() => jumpRef.current?.(shapeId, x, y), 350)
        } else {
            jumpRef.current?.(shapeId, x, y)
        }
    }, [activeBoardId])

    const handleSetJournal = useCallback((boardId: string, isJournal: boolean) => {
        setBoards(prev => prev.map(b => {
            if (b.id !== boardId) return b
            const updated = { ...b, isJournal }
            saveBoard(updated)
            return updated
        }))
    }, [])

    const handleSetStatus = useCallback((boardId: string, status: 'active' | 'archived' | 'pinned') => {
        setBoards(prev => prev.map(b => {
            if (b.id !== boardId) return b
            const updated = { ...b, status }
            saveBoard(updated)
            return updated
        }))
    }, [])

    const handleRestore = useCallback(async (restoredBoards: BoardRecord[]) => {
        await db.table('boards').clear()
        await Promise.all(restoredBoards.map(b => db.table('boards').put(b)))
        setBoards(restoredBoards)
        const firstId = restoredBoards[0]?.id ?? null
        setActiveBoardId(firstId)
        if (firstId) setNavigationStack([firstId])
        setBackupPanelOpen(false)
    }, [])

    const handleGoToWeeklyCard = useCallback(() => {
        setReviewCenterOpen(false)
        const journalBoard = boards.find(b => b.isJournal)
        if (!journalBoard) return
        const weekKey = getISOWeekKey(new Date())
        let cardId: string | null = null
        let cardX = 0
        let cardY = 0
        if (journalBoard.snapshot) {
            const store = (journalBoard.snapshot as any).document?.store ?? {}
            for (const shape of Object.values(store) as any[]) {
                if (shape.typeName === 'shape' && shape.type === 'card' && shape.props?.journalDate === weekKey) {
                    cardId = shape.id; cardX = shape.x ?? 0; cardY = shape.y ?? 0
                    break
                }
            }
        }
        if (journalBoard.id !== activeBoardId) {
            setActiveBoardId(journalBoard.id)
            setNavigationStack([journalBoard.id])
            if (cardId) setTimeout(() => jumpRef.current?.(cardId!, cardX, cardY), 400)
        } else if (cardId) {
            jumpRef.current?.(cardId, cardX, cardY)
        }
    }, [boards, activeBoardId, jumpRef])

    const handleSaveJournal = useCallback((boardId: string, dateStr: string, html: string, shapeId: string | null) => {
        if (!boardId) return
        setBoards(prev => prev.map(b => {
            if (b.id !== boardId) return b

            // Deep-clone existing snapshot, or bootstrap a minimal valid tldraw snapshot
            const snapshot: any = b.snapshot
                ? structuredClone(b.snapshot)
                : { document: { store: {}, schema: { schemaVersion: 2, sequences: {} } }, session: {} }

            // Ensure document.store exists and is an actual object reference we can mutate
            if (!snapshot.document) snapshot.document = { store: {}, schema: { schemaVersion: 2, sequences: {} } }
            if (!snapshot.document.store) snapshot.document.store = {}
            const store = snapshot.document.store

            if (shapeId && store[shapeId]) {
                store[shapeId].props.text = html
            } else {
                // Bootstrap minimum tldraw records if absent
                if (!store['document:document']) {
                    store['document:document'] = { typeName: 'document', id: 'document:document', gridSize: 10, name: '', meta: {} }
                }
                const pageRecord = Object.values(store).find((r: any) => r.typeName === 'page') as any
                const pageId = pageRecord?.id ?? 'page:page'
                if (!store[pageId]) {
                    store[pageId] = { typeName: 'page', id: pageId, name: 'Page 1', index: 'a1', meta: {} }
                }

                const existingIndices = (Object.values(store) as any[])
                    .filter(r => r.typeName === 'shape')
                    .map(r => r.index as string)
                    .filter(Boolean)
                    .sort()
                const newIndex = (existingIndices[existingIndices.length - 1] ?? 'a0') + 'V'
                const newShapeId = `shape:jd_${dateStr.replace(/-/g, '')}_${Math.random().toString(36).slice(2, 7)}`
                const allShapes = (Object.values(store) as any[]).filter(r => r.typeName === 'shape')
                const maxX = allShapes.length > 0
                    ? Math.max(...allShapes.map(s => (s.x ?? 0) + (s.props?.w ?? 240))) + 40
                    : 100
                store[newShapeId] = {
                    typeName: 'shape', id: newShapeId, type: 'card',
                    x: maxX, y: 100, rotation: 0, index: newIndex,
                    parentId: pageId, isLocked: false, opacity: 1, meta: {},
                    props: {
                        type: 'journal', text: html,
                        image: null, blobUrl: null, todos: [], url: '',
                        linkEmbedUrl: null, journalDate: dateStr,
                        state: 'idle', color: 'yellow', w: 280, h: 380,
                        cardStatus: 'none', priority: 'none', tags: [],
                    },
                }
            }
            const updated = { ...b, snapshot, updatedAt: Date.now() }
            saveBoard(updated)
            return updated
        }))
    }, [])

    const handleMoveCardToBoard = useCallback((shapeId: string, targetBoardId: string) => {
        const inboxBoard = boards.find(b => b.isInbox)
        if (!inboxBoard?.snapshot) return
        const srcStore = (inboxBoard.snapshot as any).document?.store ?? {}
        const shape = srcStore[shapeId]
        if (!shape) return

        setBoards(prev => prev.map(b => {
            if (b.id === inboxBoard.id) {
                const newStore = { ...((b.snapshot as any).document?.store ?? {}) }
                delete newStore[shapeId]
                const updated = { ...b, snapshot: { ...(b.snapshot as any), document: { ...(b.snapshot as any).document, store: newStore } } as TLEditorSnapshot, updatedAt: Date.now() }
                saveBoard(updated)
                return updated
            }
            if (b.id === targetBoardId) {
                const snap: any = b.snapshot
                    ? structuredClone(b.snapshot)
                    : { document: { store: {}, schema: { schemaVersion: 2, sequences: {} } }, session: {} }
                if (!snap.document) snap.document = { store: {}, schema: { schemaVersion: 2, sequences: {} } }
                if (!snap.document.store) snap.document.store = {}
                const st = snap.document.store
                if (!st['document:document']) st['document:document'] = { typeName: 'document', id: 'document:document', gridSize: 10, name: '', meta: {} }
                const pageRec = (Object.values(st) as any[]).find(r => r.typeName === 'page')
                const pageId = pageRec?.id ?? 'page:page'
                if (!st[pageId]) st[pageId] = { typeName: 'page', id: pageId, name: 'Page 1', index: 'a1', meta: {} }
                const existingShapes = (Object.values(st) as any[]).filter(r => r.typeName === 'shape')
                const maxX = existingShapes.length > 0 ? Math.max(...existingShapes.map((s: any) => (s.x ?? 0) + (s.props?.w ?? 240))) + 40 : 100
                st[shapeId] = { ...structuredClone(shape), parentId: pageId, x: maxX, y: 100 }
                const updated = { ...b, snapshot: snap as TLEditorSnapshot, updatedAt: Date.now() }
                saveBoard(updated)
                return updated
            }
            return b
        }))

        // 通知目前開著的 tldraw editor 刪除 shape
        window.dispatchEvent(new CustomEvent('delete-shape-from-editor', { detail: { shapeId } }))
    }, [boards])

    if (loading) return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Loading...</div>

    return (
        <>
            {activeBoard && (
                <Whiteboard
                    key={activeBoard.id}
                    board={activeBoard}
                    boards={boards}
                    onSaveBoard={handleSaveBoard}
                    jumpRef={jumpRef}
                    onOpenSearch={() => setSearchOpen(true)}
                    onOpenHotkey={() => setHotkeyOpen(true)}
                    onCreateBoard={(name) => handleCreateBoard(name, activeBoardId ?? undefined)}
                    onSwitchBoard={handleSwitchToChild}
                    sidebarWidth={sidebarWidth}
                    isInboxBoard={activeBoardId === INBOX_BOARD_ID}
                    onMoveCard={shapeId => setMovingCardShapeId(shapeId)}
                />
            )}

            <BoardTabBar
                boards={boards}
                activeBoardId={activeBoardId ?? ''}
                onSwitch={handleSwitch}
                onNew={handleNew}
                onRename={handleRename}
                onDelete={handleDelete}
                onSearch={() => setSearchOpen(true)}
                onHotkey={() => setHotkeyOpen(true)}
                onOpenOverview={() => setOverviewOpen(true)}
                onSetJournal={handleSetJournal}
                navigationStack={navigationStack}
                onBack={handleBack}
                onSetParent={handleSetParent}
                onSwitchToChild={handleSwitchToChild}
                collapsed={sidebarCollapsed}
                onToggleCollapse={handleToggleCollapse}
                onSetStatus={handleSetStatus}
                onOpenTaskCenter={() => setTaskCenterOpen(true)}
                onOpenFilter={() => setFilterOpen(true)}
                onOpenReviewCenter={() => setReviewCenterOpen(true)}
                onOpenBackup={() => setBackupPanelOpen(true)}
                onGoToInbox={() => { setActiveBoardId(INBOX_BOARD_ID); setNavigationStack([INBOX_BOARD_ID]) }}
                onOpenKnowledgeGraph={() => setKnowledgeGraphOpen(true)}
            />

            {movingCardShapeId && (
                <MoveCardModal
                    boards={boards}
                    onSelect={targetBoardId => { handleMoveCardToBoard(movingCardShapeId, targetBoardId); setMovingCardShapeId(null) }}
                    onClose={() => setMovingCardShapeId(null)}
                />
            )}
            {searchOpen && <SearchPanel boards={boards} onJump={handleJump} onClose={() => setSearchOpen(false)} />}
            {hotkeyOpen && <HotkeyPanel onClose={() => setHotkeyOpen(false)} />}
            {taskCenterOpen && <TaskCenter boards={boards} onJump={(boardId, shapeId, x, y) => { setTaskCenterOpen(false); handleJump(boardId, shapeId, x, y) }} onClose={() => setTaskCenterOpen(false)} />}
            {filterOpen && <FilterPanel boards={boards} onJump={(boardId, shapeId, x, y) => { setFilterOpen(false); handleJump(boardId, shapeId, x, y) }} onClose={() => setFilterOpen(false)} />}
            {backupPanelOpen && (
                <BackupPanel
                    sidebarWidth={sidebarWidth}
                    onClose={() => setBackupPanelOpen(false)}
                    onRestore={handleRestore}
                />
            )}
            {overviewOpen && (
                <BoardOverview
                    boards={boards}
                    activeBoardId={activeBoardId ?? ''}
                    onSelect={handleSwitch}
                    onNew={handleNew}
                    onRename={handleRename}
                    onDelete={handleDelete}
                    onClose={() => setOverviewOpen(false)}
                />
            )}
            {reviewCenterOpen && (
                <ReviewCenter
                    boards={boards}
                    onClose={() => setReviewCenterOpen(false)}
                    onJumpToBoard={handleSwitch}
                    onSaveJournal={handleSaveJournal}
                    onGoToWeeklyCard={handleGoToWeeklyCard}
                />
            )}
            {knowledgeGraphOpen && (
                <KnowledgeGraph
                    boards={boards}
                    onClose={() => setKnowledgeGraphOpen(false)}
                    onJumpToCard={(boardId, shapeId) => {
                        setKnowledgeGraphOpen(false)
                        handleSwitch(boardId)
                        setTimeout(() => jumpRef.current?.(shapeId, 0, 0), 400)
                    }}
                    onSwitchBoard={boardId => {
                        setKnowledgeGraphOpen(false)
                        handleSwitch(boardId)
                    }}
                />
            )}
        </>
    )
}