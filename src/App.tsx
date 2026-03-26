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
import Dexie from 'dexie'
import { CardShapeUtil, BoardsContext } from './components/card-shape/CardShapeUtil'
import TldrawToolPanel, { type CardCreators } from './TIdrawToolPanel'
import { SearchPanel } from './SearchPanel'
import { useHotkeys } from './Usehotkeys'
import { HotkeyPanel } from './HotkeyPanel'
import { useContextMenu } from './ContextMenu'
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

const db = new Dexie('AstrolabeDB')
db.version(1).stores({ snapshots: 'id' })
db.version(2).stores({ snapshots: 'id', boards: 'id' })

interface BoardRecord {
    id: string
    name: string
    snapshot: TLEditorSnapshot | null
    thumbnail: string | null
    updatedAt: number
    parentId?: string | null
    isHome?: boolean   // 主頁白板，固定在第一個
    isJournal?: boolean  // ← 新增：Journal 白板，自動建立今日卡片
}

const HOME_BOARD_ID = 'home_board'

const generateId = () => `board_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

const loadAllBoards = async (): Promise<BoardRecord[]> => {
    const boards = await db.table('boards').toArray()

    // 確保主頁存在
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

    if (boards.filter(b => !b.isHome).length === 0) {
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

    // 主頁永遠在第一個，其他按 updatedAt 排序
    const home = boards.filter(b => b.isHome)
    const rest = boards.filter(b => !b.isHome).sort((a, b) => a.updatedAt - b.updatedAt)
    return [...home, ...rest]
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

    const filtered = boards
        .filter(b => !b.isHome && b.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => b.updatedAt - a.updatedAt)

    const formatDate = (ts: number) => {
        const diffMs = Date.now() - ts
        const diffMin = Math.floor(diffMs / 60000)
        const diffHr = Math.floor(diffMs / 3600000)
        const diffDay = Math.floor(diffMs / 86400000)
        if (diffMin < 1) return '剛剛'
        if (diffMin < 60) return `${diffMin} 分鐘前`
        if (diffHr < 24) return `${diffHr} 小時前`
        if (diffDay < 7) return `${diffDay} 天前`
        const d = new Date(ts)
        return `${d.getMonth() + 1}/${d.getDate()}`
    }

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
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 24px', borderBottom: '1px solid #e8e8e6',
                background: 'rgba(255,255,255,0.8)', flexShrink: 0,
            }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', letterSpacing: '-0.3px' }}>
                    所有白板
                </span>
                <span style={{
                    fontSize: 11, color: '#999', background: '#f0f0ee',
                    borderRadius: 6, padding: '2px 8px',
                }}>
                    {filtered.length}
                </span>
                <div style={{ flex: 1, maxWidth: 300, marginLeft: 4, position: 'relative' }}>
                    <span style={{
                        position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                        color: '#ccc', fontSize: 13, pointerEvents: 'none',
                    }}>🔍</span>
                    <input
                        autoFocus
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="搜尋白板名稱..."
                        style={{
                            width: '100%', paddingLeft: 30, paddingRight: 12,
                            paddingTop: 6, paddingBottom: 6,
                            borderRadius: 8, border: '1px solid #e0e0de',
                            background: '#fafaf8', fontSize: 13, color: '#1a1a1a',
                            outline: 'none', boxSizing: 'border-box',
                        }}
                    />
                </div>
                <div style={{ flex: 1 }} />
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
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 0, flexShrink: 0,
                    }}
                >✕</button>
            </div>

            {/* Grid */}
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
                            border: activeBoardId === board.id
                                ? '2px solid #1a1a1a'
                                : `2px solid ${hoveredId === board.id ? '#d0d0ce' : '#e8e8e6'}`,
                            background: 'white',
                            cursor: 'pointer',
                            overflow: 'hidden',
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                            boxShadow: hoveredId === board.id
                                ? '0 4px 16px rgba(0,0,0,0.08)'
                                : '0 1px 4px rgba(0,0,0,0.04)',
                            display: 'flex', flexDirection: 'column',
                        }}
                    >
                        {/* 縮圖 */}
                        <div style={{
                            width: '100%', aspectRatio: '16/10',
                            background: '#f7f7f5',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            overflow: 'hidden', borderBottom: '1px solid #f0f0ee',
                            position: 'relative',
                        }}>
                            {board.thumbnail ? (
                                <img
                                    src={`data:image/svg+xml;utf8,${encodeURIComponent(board.thumbnail)}`}
                                    style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8, boxSizing: 'border-box' }}
                                    alt=""
                                />
                            ) : (
                                <span style={{ fontSize: 24, opacity: 0.15 }}>□</span>
                            )}
                            {activeBoardId === board.id && (
                                <div style={{
                                    position: 'absolute', top: 7, right: 7,
                                    background: '#1a1a1a', color: 'white',
                                    fontSize: 10, fontWeight: 600,
                                    padding: '2px 6px', borderRadius: 4,
                                }}>使用中</div>
                            )}
                            {childCount(board.id) > 0 && (
                                <div style={{
                                    position: 'absolute', bottom: 7, left: 7,
                                    background: 'rgba(0,0,0,0.45)', color: 'white',
                                    fontSize: 10, padding: '2px 6px', borderRadius: 4,
                                }}>📋 {childCount(board.id)} 個子板</div>
                            )}
                            {/* Journal badge */}
                            {board.isJournal && (
                                <div style={{
                                    position: 'absolute', bottom: 7, right: 7,
                                    background: 'rgba(99,56,6,0.8)', color: 'white',
                                    fontSize: 10, padding: '2px 6px', borderRadius: 4,
                                }}>📔 Journal</div>
                            )}
                        </div>

                        {/* 資訊列 */}
                        <div style={{ padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 6, minHeight: 42 }}>
                            {renamingId === board.id ? (
                                <input
                                    autoFocus
                                    value={renameValue}
                                    onChange={e => setRenameValue(e.target.value)}
                                    onBlur={() => commitRename(board.id)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') commitRename(board.id)
                                        if (e.key === 'Escape') setRenamingId(null)
                                        e.stopPropagation()
                                    }}
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                        flex: 1, border: 'none', borderBottom: '1.5px solid #1a1a1a',
                                        outline: 'none', fontSize: 13, fontWeight: 500,
                                        background: 'transparent', padding: '2px 0',
                                    }}
                                />
                            ) : (
                                <>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: 13, fontWeight: 500, color: '#1a1a1a',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>{board.name}</div>
                                        <div style={{ fontSize: 11, color: '#bbb', marginTop: 1 }}>
                                            {formatDate(board.updatedAt)}
                                        </div>
                                    </div>
                                    {hoveredId === board.id && (
                                        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                                            <button
                                                onClick={e => startRename(board, e)}
                                                title="重新命名"
                                                style={{
                                                    width: 24, height: 24, borderRadius: 6,
                                                    border: '1px solid #e0e0de', background: 'white',
                                                    cursor: 'pointer', fontSize: 11,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    padding: 0, color: '#555',
                                                }}
                                            >✎</button>
                                            {boards.filter(b => !b.isHome).length > 1 && (
                                                <button
                                                    onClick={e => {
                                                        e.stopPropagation()
                                                        if (confirm(`確定刪除「${board.name}」嗎？`)) onDelete(board.id)
                                                    }}
                                                    title="刪除"
                                                    style={{
                                                        width: 24, height: 24, borderRadius: 6,
                                                        border: '1px solid #e0e0de', background: 'white',
                                                        cursor: 'pointer', fontSize: 11,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        padding: 0, color: '#e84040',
                                                    }}
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

/* --------------------------------------------------------------- BoardTabBar */
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
    onSetJournal: (boardId: string, isJournal: boolean) => void  // ← 新增
    navigationStack: string[]   // 導航歷史 [rootId, ..., currentId]
    onBack: () => void          // 返回上一層
    onSetParent: (boardId: string, parentId: string | null) => void  // 設定父板
    onSwitchToChild: (id: string) => void  // 進入子板（帶麵包屑）
}

function BoardTabBar({ boards, activeBoardId, onSwitch, onNew, onRename, onDelete, onSearch, onHotkey, onOpenOverview, onSetJournal, navigationStack, onBack, onSetParent, onSwitchToChild }: BoardTabBarProps) {
    const [hoveredId, setHoveredId] = useState<string | null>(null)
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const [contextMenu, setContextMenu] = useState<{ boardId: string; x: number; y: number } | null>(null)
    const [selectingParentFor, setSelectingParentFor] = useState<string | null>(null)

    const startRename = (board: BoardRecord) => { setRenamingId(board.id); setRenameValue(board.name) }
    const commitRename = (id: string) => { if (renameValue.trim()) onRename(id, renameValue.trim()); setRenamingId(null) }

    // 麵包屑：navigationStack 有超過1層時才顯示
    const showBreadcrumb = navigationStack.length > 1

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, height: 48,
            background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(8px)',
            borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center',
            zIndex: 10000,
        }}>
            {/* 可捲動的 Tab 區域 */}
            <div style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 4,
                paddingLeft: 12, overflowX: 'auto', overflowY: 'hidden',
                scrollbarWidth: 'none', // Firefox 隱藏捲軸
            }}>
                {/* 麵包屑導航 */}
                {showBreadcrumb && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        marginRight: 8, flexShrink: 0,
                    }}>
                        {navigationStack.map((boardId, idx) => {
                            const b = boards.find(b => b.id === boardId)
                            if (!b) return null
                            const isLast = idx === navigationStack.length - 1
                            return (
                                <div key={boardId} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {idx > 0 && <span style={{ color: '#bbb', fontSize: 12 }}>›</span>}
                                    <span
                                        onClick={() => !isLast && onSwitch(boardId)}
                                        style={{
                                            fontSize: 13, cursor: isLast ? 'default' : 'pointer',
                                            color: isLast ? '#1a1a1a' : '#888',
                                            fontWeight: isLast ? 600 : 400,
                                            textDecoration: isLast ? 'none' : 'underline',
                                        }}
                                        onMouseEnter={e => { if (!isLast) (e.target as HTMLElement).style.color = '#1971c2' }}
                                        onMouseLeave={e => { if (!isLast) (e.target as HTMLElement).style.color = '#888' }}
                                    >
                                        {b.name}
                                    </span>
                                </div>
                            )
                        })}
                        {/* 返回按鈕 */}
                        <button
                            onClick={onBack}
                            title="返回上一層"
                            style={{
                                marginLeft: 4, padding: '2px 8px', borderRadius: 6,
                                border: '1px solid #eee', background: 'transparent',
                                cursor: 'pointer', fontSize: 12, color: '#888',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            ← 返回
                        </button>
                        <div style={{ width: 1, height: 20, background: '#eee', marginLeft: 4 }} />
                    </div>
                )}
                {boards.filter(b => !b.parentId).map(board => (
                    <div
                        key={board.id}
                        onMouseEnter={() => setHoveredId(board.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => onSwitch(board.id)}
                        onContextMenu={(e) => { e.preventDefault(); if (!board.isHome) setContextMenu({ boardId: board.id, x: e.clientX, y: e.clientY }) }}
                        style={{
                            position: 'relative', display: 'flex', alignItems: 'center', gap: 6,
                            padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                            background: activeBoardId === board.id ? '#f0f4ff' : 'transparent',
                            border: activeBoardId === board.id ? '1px solid #c7d7fd' : '1px solid transparent',
                            minWidth: 0, flexShrink: 0, transition: 'background 0.15s',
                        }}
                    >
                        <div style={{
                            width: 32, height: 22, borderRadius: 4, overflow: 'hidden',
                            background: '#f5f5f5', border: '1px solid #e0e0e0', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            {board.thumbnail
                                ? <img src={`data:image/svg+xml;utf8,${encodeURIComponent(board.thumbnail)}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                : <span style={{ fontSize: 10, color: '#ccc' }}>空</span>
                            }
                        </div>

                        {renamingId === board.id ? (
                            <input
                                autoFocus value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onBlur={() => commitRename(board.id)}
                                onKeyDown={e => { if (e.key === 'Enter') commitRename(board.id); if (e.key === 'Escape') setRenamingId(null); e.stopPropagation() }}
                                onClick={e => e.stopPropagation()}
                                style={{ width: 80, border: 'none', borderBottom: '1px solid #333', outline: 'none', fontSize: 13, background: 'transparent' }}
                            />
                        ) : (
                            <span
                                onDoubleClick={(e) => { e.stopPropagation(); startRename(board) }}
                                style={{
                                    fontSize: 13, color: activeBoardId === board.id ? '#1a1a1a' : '#555',
                                    fontWeight: activeBoardId === board.id ? 600 : 400,
                                    maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', userSelect: 'none',
                                }}
                            >{board.name}{board.isJournal ? ' 📔' : ''}</span>
                        )}

                        {hoveredId === board.id && boards.length > 1 && !board.isHome && (
                            <button
                                onClick={(e) => { e.stopPropagation(); if (confirm(`確定刪除「${board.name}」嗎？`)) onDelete(board.id) }}
                                style={{
                                    position: 'absolute', top: -6, right: -6, width: 16, height: 16,
                                    borderRadius: '50%', background: '#ff4d4f', color: 'white', border: 'none',
                                    cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1,
                                }}
                            >×</button>
                        )}
                    </div>
                ))}

            </div>{/* 可捲動 Tab 區域結束 */}

            {/* 固定右側按鈕區 */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                paddingLeft: 8, paddingRight: 12, flexShrink: 0,
                borderLeft: '1px solid #eee',
            }}>
                <button onClick={onNew} style={{
                    width: 28, height: 28, borderRadius: 8, border: '1px dashed #ccc',
                    background: 'transparent', cursor: 'pointer', fontSize: 18, color: '#aaa',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0,
                }} title="新增白板">+</button>

                <button onClick={onOpenOverview} style={{
                    width: 28, height: 28, borderRadius: 8, border: '1px solid #eee',
                    background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#888',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0,
                }} title="所有白板 (Cmd+Shift+O)">⊞</button>

                <button onClick={onSearch} style={{
                    width: 28, height: 28, borderRadius: 8, border: '1px solid #eee',
                    background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#888',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0,
                }} title="搜尋卡片 (Ctrl+F)">🔍</button>

                <button onClick={onHotkey} style={{
                    width: 28, height: 28, borderRadius: 8, border: '1px solid #eee',
                    background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#888',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0,
                }} title="快捷鍵 (?)">⌨️</button>
            </div>

            {/* 右鍵選單 */}
            {contextMenu && (() => {
                const targetBoard = boards.find(b => b.id === contextMenu.boardId)
                if (!targetBoard) return null
                return (
                    <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 99998 }} onClick={() => setContextMenu(null)} />
                        <div style={{
                            position: 'fixed', left: contextMenu.x, top: contextMenu.y,
                            background: 'white', borderRadius: 10, padding: '4px 0',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)',
                            zIndex: 99999, minWidth: 180,
                        }}>
                            <div style={{ padding: '4px 12px 6px', fontSize: 11, color: '#aaa', borderBottom: '1px solid #f0f0f0', marginBottom: 4 }}>
                                {targetBoard.name}
                            </div>
                            {/* ← 新增：Journal 設定選項 */}
                            <div
                                onClick={() => {
                                    onSetJournal(contextMenu.boardId, !targetBoard.isJournal)
                                    setContextMenu(null)
                                }}
                                style={{ padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#fffbe6')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                {targetBoard.isJournal ? '📔 取消 Journal 白板' : '📔 設為 Journal 白板'}
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
                                onClick={() => {
                                    if (confirm(`確定刪除「${targetBoard.name}」嗎？`)) {
                                        onDelete(contextMenu.boardId)
                                        setContextMenu(null)
                                    }
                                }}
                                style={{ padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: '#e03131' }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#fff5f5')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                🗑️ 刪除白板
                            </div>
                            {/* 查看子板（遞迴顯示所有後代） */}
                            {boards.filter(b => b.parentId === contextMenu.boardId).length > 0 && (() => {
                                const renderChildren = (parentId: string, depth: number): React.ReactNode => {
                                    return boards.filter(b => b.parentId === parentId).map(child => (
                                        <React.Fragment key={child.id}>
                                            <div
                                                style={{
                                                    display: 'flex', alignItems: 'center',
                                                    paddingLeft: 14 + depth * 12,
                                                    paddingRight: 8,
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                {renamingId === child.id ? (
                                                    <input
                                                        autoFocus
                                                        defaultValue={child.name}
                                                        onBlur={() => { commitRename(child.id); }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') commitRename(child.id)
                                                            if (e.key === 'Escape') setRenamingId(null)
                                                            e.stopPropagation()
                                                        }}
                                                        onChange={e => setRenameValue(e.target.value)}
                                                        onClick={e => e.stopPropagation()}
                                                        style={{
                                                            flex: 1, border: 'none', borderBottom: '1px solid #333',
                                                            outline: 'none', fontSize: 13, background: 'transparent',
                                                            padding: '4px 0',
                                                        }}
                                                    />
                                                ) : (
                                                    <div
                                                        onClick={(e) => {
                                                            // 用 timer 延遲，雙擊時取消單擊
                                                            const timer = setTimeout(() => {
                                                                onSwitchToChild(child.id)
                                                                setContextMenu(null)
                                                            }, 200)
                                                                ; (e.currentTarget as any)._clickTimer = timer
                                                        }}
                                                        onDoubleClick={(e) => {
                                                            e.stopPropagation()
                                                            clearTimeout((e.currentTarget as any)._clickTimer)
                                                            startRename(child)
                                                        }}
                                                        style={{ flex: 1, padding: '7px 6px 7px 0', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                                                        title="單擊進入・雙擊重新命名"
                                                    >
                                                        <span style={{ color: '#aaa', fontSize: 11 }}>{depth > 0 ? '└' : '📋'}</span>
                                                        {child.name}
                                                    </div>
                                                )}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); startRename(child) }}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        color: '#aaa', fontSize: 11, padding: '2px 4px', borderRadius: 4,
                                                        flexShrink: 0,
                                                    }}
                                                    onMouseEnter={e => (e.currentTarget.style.color = '#333')}
                                                    onMouseLeave={e => (e.currentTarget.style.color = '#aaa')}
                                                    title="重新命名"
                                                >✏️</button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        onSetParent(child.id, null)
                                                        setContextMenu(null)
                                                    }}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        color: '#aaa', fontSize: 11, padding: '2px 4px', borderRadius: 4,
                                                        flexShrink: 0, whiteSpace: 'nowrap',
                                                    }}
                                                    onMouseEnter={e => (e.currentTarget.style.color = '#1971c2')}
                                                    onMouseLeave={e => (e.currentTarget.style.color = '#aaa')}
                                                    title="升為主板"
                                                >↑主板</button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        if (confirm(`確定刪除「${child.name}」嗎？`)) {
                                                            onDelete(child.id)
                                                            setContextMenu(null)
                                                        }
                                                    }}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        color: '#ccc', fontSize: 14, padding: '2px 4px', borderRadius: 4,
                                                        flexShrink: 0,
                                                    }}
                                                    onMouseEnter={e => (e.currentTarget.style.color = '#e03131')}
                                                    onMouseLeave={e => (e.currentTarget.style.color = '#ccc')}
                                                    title="刪除子板"
                                                >×</button>
                                            </div>
                                            {renderChildren(child.id, depth + 1)}
                                        </React.Fragment>
                                    ))
                                }
                                return (
                                    <>
                                        <div style={{ height: 1, background: '#f0f0f0', margin: '4px 0' }} />
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
                // 排除自己和自己的所有後代（避免循環）
                const getDescendants = (id: string): string[] => {
                    const children = boards.filter(b => b.parentId === id).map(b => b.id)
                    return [...children, ...children.flatMap(getDescendants)]
                }
                const excluded = new Set([selectingParentFor, ...getDescendants(selectingParentFor)])

                // 建立有層級的清單
                const buildTree = (parentId: string | null | undefined, depth: number): { board: BoardRecord; depth: number }[] => {
                    return boards
                        .filter(b => (b.parentId ?? null) === (parentId ?? null) && !excluded.has(b.id))
                        .flatMap(b => [{ board: b, depth }, ...buildTree(b.id, depth + 1)])
                }
                const tree = buildTree(null, 0)
                return (
                    <>
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 99998 }} onClick={() => setSelectingParentFor(null)} />
                        <div style={{
                            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                            background: 'white', borderRadius: 14, padding: 20,
                            boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
                            zIndex: 99999, minWidth: 280,
                        }}>
                            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>設為子板</div>
                            <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
                                將「{target?.name}」設為哪個白板的子板？
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {tree.map(({ board: b, depth }) => (
                                    <div
                                        key={b.id}
                                        onClick={() => { onSetParent(selectingParentFor, b.id); setSelectingParentFor(null) }}
                                        style={{
                                            padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                                            border: '1px solid #eee', fontSize: 13,
                                            marginLeft: depth * 16,
                                            display: 'flex', alignItems: 'center', gap: 6,
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        {depth > 0 && <span style={{ color: '#ccc', fontSize: 11 }}>{'└'}</span>}
                                        {b.name}
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={() => setSelectingParentFor(null)}
                                style={{ marginTop: 12, width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #eee', cursor: 'pointer', fontSize: 13 }}
                            >取消</button>
                        </div>
                    </>
                )
            })()}
        </div>
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
}

function Whiteboard({ board, boards, onSaveBoard, jumpRef, onOpenSearch, onOpenHotkey, onCreateBoard, onSwitchBoard }: WhiteboardProps) {
    const boardInfos = boards.map(b => ({ id: b.id, name: b.name, thumbnail: b.thumbnail }))
    return (
        <div onDoubleClickCapture={(e) => { e.stopPropagation(); e.preventDefault() }} style={{ position: 'fixed', inset: 0, top: 48 }}>
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
                    />
                </Tldraw>
            </BoardsContext.Provider>
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
}

function WhiteboardTools({ board, onSaveBoard, jumpRef, onOpenSearch, onOpenHotkey, boards, onCreateBoard, onSwitchBoard }: WhiteboardToolsProps) {
    const editor = useEditor()
    const initialized = useRef(false)
    const imageInputRef = useRef<HTMLInputElement>(null)

    // 支援在指定座標建立卡片
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
            props: {
                type: 'board', text: newBoard.name,
                image: null, blobUrl: null, todos: [],
                url: '', linkEmbedUrl: null,
                linkedBoardId: newBoard.id,
                state: 'idle', color: 'none', w: 280, h: 200,
            }
        })
    }, [editor, onCreateBoard, boards.length])

    const createColumnCard = useCallback((x?: number, y?: number) => {
        const center = editor.getViewportScreenCenter()
        const pageCenter = editor.screenToPage(center)
        editor.createShape({
            type: 'frame',
            x: x ?? pageCenter.x - 160,
            y: y ?? pageCenter.y - 240,
            props: {
                w: 320,
                h: 480,
                name: '欄位',
            }
        })
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

    // 雙擊 board 卡片跳轉
    useEffect(() => {
        const handleBoardEnter = (e: CustomEvent) => {
            const { linkedBoardId } = e.detail
            if (linkedBoardId) onSwitchBoard(linkedBoardId)
        }
        window.addEventListener('board-card-enter' as any, handleBoardEnter)
        return () => window.removeEventListener('board-card-enter' as any, handleBoardEnter)
    }, [onSwitchBoard])

    // 設為子板時，自動在父板建立 Board 卡片
    useEffect(() => {
        const handler = (e: CustomEvent) => {
            const { targetBoardId, linkedBoardId, boardName } = e.detail
            // 只有目前是父板才處理
            if (targetBoardId !== board.id) return
            const center = editor.getViewportScreenCenter()
            const pageCenter = editor.screenToPage(center)
            editor.createShape({
                type: 'card',
                x: pageCenter.x - 140,
                y: pageCenter.y - 100,
                props: {
                    type: 'board', text: boardName,
                    image: null, blobUrl: null, todos: [],
                    url: '', linkEmbedUrl: null,
                    linkedBoardId,
                    state: 'idle', color: 'none', w: 280, h: 200,
                }
            })
        }
        window.addEventListener('create-board-card-on' as any, handler)
        return () => window.removeEventListener('create-board-card-on' as any, handler)
    }, [board.id, editor])

    // 右鍵選單
    const { menuElement } = useContextMenu({
        editor,
        createTextCard,
        createTodoCard,
        createLinkCard,
        openImageInput,
    })

    // 快捷鍵
    useHotkeys(editor, {
        createTextCard: () => createTextCard(),
        createTodoCard: () => createTodoCard(),
        createLinkCard: () => createLinkCard(),
        openImageInput,
        openSearch: onOpenSearch,
        openHotkeyPanel: onOpenHotkey,
    })

    // Ctrl+V 貼上圖片
    useEffect(() => {
        const handlePaste = async (e: ClipboardEvent) => {
            // 如果焦點在輸入框，讓瀏覽器原生處理
            const target = e.target as HTMLElement
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

            const items = e.clipboardData?.items
            if (!items) return

            // 方法 1：直接是圖片檔案（截圖、從本機複製）
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
                        editor.createShape({
                            type: 'card',
                            x: pagePoint.x - 150, y: pagePoint.y - 100,
                            props: {
                                type: 'image', text: '', image: base64,
                                blobUrl: null, todos: [], url: '',
                                state: 'idle', w: 300, h: 200
                            }
                        })
                    }
                    reader.readAsDataURL(file)
                    return
                }
            }

            // 方法 2：HTML 裡面有 <img src="...">（從網頁右鍵複製圖片）
            const htmlItem = Array.from(items).find(i => i.type === 'text/html')
            if (htmlItem) {
                htmlItem.getAsString(async (html) => {
                    const match = html.match(/<img[^>]+src=["']([^"']+)["']/)
                    if (!match) return
                    const imgUrl = match[1]
                    console.log('[Paste] found img url from html:', imgUrl)

                    try {
                        // 用 fetch 把圖片抓下來轉 base64
                        const res = await fetch(imgUrl)
                        const blob = await res.blob()
                        const reader = new FileReader()
                        reader.onload = () => {
                            const base64 = reader.result as string
                            const center = editor.getViewportScreenCenter()
                            const pagePoint = editor.screenToPage(center)
                            editor.createShape({
                                type: 'card',
                                x: pagePoint.x - 150, y: pagePoint.y - 100,
                                props: {
                                    type: 'image', text: '', image: base64,
                                    blobUrl: null, todos: [], url: '',
                                    state: 'idle', w: 300, h: 200
                                }
                            })
                        }
                        reader.readAsDataURL(blob)
                    } catch (err) {
                        console.warn('[Paste] fetch image failed:', err)
                        // fetch 失敗的話直接用 url 當 src
                        const center = editor.getViewportScreenCenter()
                        const pagePoint = editor.screenToPage(center)
                        editor.createShape({
                            type: 'card',
                            x: pagePoint.x - 150, y: pagePoint.y - 100,
                            props: {
                                type: 'image', text: '', image: imgUrl,
                                blobUrl: null, todos: [], url: '',
                                state: 'idle', w: 300, h: 200
                            }
                        })
                    }
                })
                return
            }

            // 方法 3：純文字是網址 → 建立連結卡片
            const textItem = Array.from(items).find(i => i.type === 'text/plain')
            if (textItem) {
                textItem.getAsString((text) => {
                    const trimmed = text.trim()
                    try {
                        new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
                        const center = editor.getViewportScreenCenter()
                        const pagePoint = editor.screenToPage(center)
                        editor.createShape({
                            type: 'card',
                            x: pagePoint.x - 130, y: pagePoint.y - 60,
                            props: {
                                type: 'link', text: '', image: null,
                                blobUrl: null, todos: [], url: trimmed,
                                state: 'idle', w: 260, h: 120
                            }
                        })
                    } catch {
                        // 不是網址，忽略
                    }
                })
            }
        }

        window.addEventListener('paste', handlePaste)
        return () => window.removeEventListener('paste', handlePaste)
    }, [editor, createImageCard])

    // 匯出 PNG
    const exportPNG = useCallback(async (selectedOnly: boolean) => {
        const allIds = Array.from(editor.getCurrentPageShapeIds())
        const selectedIds = editor.getSelectedShapeIds()
        const ids = selectedOnly ? Array.from(selectedIds) : allIds
        if (ids.length === 0) { alert(selectedOnly ? '請先選取卡片' : '白板沒有卡片'); return }
        const blob = await exportToBlob({
            editor, ids: ids as any,
            format: 'png',
            opts: { background: true, scale: 2 },
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `${board.name}.png`; a.click()
        URL.revokeObjectURL(url)
    }, [editor, board.name])

    // 匯出 PDF
    const exportPDF = useCallback(async (selectedOnly: boolean) => {
        const allIds = Array.from(editor.getCurrentPageShapeIds())
        const selectedIds = editor.getSelectedShapeIds()
        const ids = selectedOnly ? Array.from(selectedIds) : allIds
        if (ids.length === 0) { alert(selectedOnly ? '請先選取卡片' : '白板沒有卡片'); return }
        const blob = await exportToBlob({
            editor, ids: ids as any,
            format: 'png',
            opts: { background: true, scale: 2 },
        })
        const imgUrl = URL.createObjectURL(blob)
        const img = new Image()
        img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.width; canvas.height = img.height
            const ctx = canvas.getContext('2d')!
            ctx.drawImage(img, 0, 0)
            const imgData = canvas.toDataURL('image/png')
            // 動態載入 jsPDF
            if ((window as any).jspdf) {
                const { jsPDF } = (window as any).jspdf
                const pdf = new jsPDF({
                    orientation: img.width > img.height ? 'landscape' : 'portrait',
                    unit: 'px', format: [img.width / 2, img.height / 2],
                })
                pdf.addImage(imgData, 'PNG', 0, 0, img.width / 2, img.height / 2)
                pdf.save(`${board.name}.pdf`)
            } else {
                const script = document.createElement('script')
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
                script.onload = () => {
                    const { jsPDF } = (window as any).jspdf
                    const pdf = new jsPDF({
                        orientation: img.width > img.height ? 'landscape' : 'portrait',
                        unit: 'px', format: [img.width / 2, img.height / 2],
                    })
                    pdf.addImage(imgData, 'PNG', 0, 0, img.width / 2, img.height / 2)
                    pdf.save(`${board.name}.pdf`)
                }
                document.head.appendChild(script)
            }
            URL.revokeObjectURL(imgUrl)
        }
        img.src = imgUrl
    }, [editor, board.name])

    const [showExportMenu, setShowExportMenu] = useState(false)

    useEffect(() => {
        if (!editor || initialized.current) return
        initialized.current = true
        if (board.snapshot) loadSnapshot(editor.store, board.snapshot)

        // 載入後自動補建 Board 卡片
        setTimeout(() => {
            // 主頁：顯示所有主板的 Board 卡片
            // 一般白板：顯示直接子板的 Board 卡片
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
                            props: {
                                type: 'board', text: child.name,
                                image: null, blobUrl: null, todos: [],
                                url: '', linkEmbedUrl: null,
                                linkedBoardId: child.id,
                                state: 'idle', color: 'none', w: 280, h: 200,
                            }
                        })
                    })
                }
            }

            // ← 新增：Journal 白板自動建立今日卡片
            if (board.isJournal) {
                const today = new Date()
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
                const weekDay = ['日', '一', '二', '三', '四', '五', '六'][today.getDay()]
                const todayLabel = `${today.getMonth() + 1}/${today.getDate()}（${weekDay}）`

                // 檢查今日卡片是否已存在（用 journalDate 比對）
                const alreadyExists = editor.getCurrentPageShapes().some(
                    s => (s.props as any).journalDate === todayStr
                )
                if (!alreadyExists) {
                    // 排在所有現有卡片最右側
                    const allShapes = editor.getCurrentPageShapes()
                    const maxX = allShapes.length > 0
                        ? Math.max(...allShapes.map(s => s.x + ((s.props as any).w ?? 240))) + 40
                        : 100

                    const journalText = `<h2>${todayLabel}</h2><p><strong>今天做了什麼</strong></p><p></p><p><strong>學到什麼（在哪個白板）</strong></p><p></p><p><strong>計畫/待辦</strong></p><p></p><p><strong>卡住的地方</strong></p><p></p><p><strong>明天先做</strong></p><p></p>`
                    editor.createShape({
                        type: 'card',
                        x: maxX,
                        y: 100,
                        props: {
                            type: 'journal',
                            text: journalText,
                            image: null,
                            blobUrl: null,
                            todos: [],
                            url: '',
                            linkEmbedUrl: null,
                            journalDate: todayStr,
                            state: 'idle',
                            color: 'yellow',
                            w: 280,
                            h: 380,
                        }
                    })
                    // ← 在這裡加：今日 Todo 卡片，放在 journal 右邊
                    editor.createShape({
                        type: 'card',
                        x: maxX + 320,
                        y: 100,
                        props: {
                            type: 'todo',
                            text: `${todayLabel} 計畫`,
                            image: null,
                            blobUrl: null,
                            todos: [
                                { id: `todo_${Date.now()}`, text: '今日任務', checked: false },
                            ],
                            url: null,
                            linkEmbedUrl: null,
                            journalDate: todayStr,
                            state: 'idle',
                            color: 'blue',
                            w: 260,
                            h: 200,
                        }
                    })
                }
            }
        }, 300)
    }, [editor, board])

    useEffect(() => {
        jumpRef.current = (shapeId: string, x: number, y: number) => {
            try {
                const shape = editor.getShape(shapeId as any)
                if (shape) {
                    editor.select(shapeId as any)
                    editor.zoomToSelection({ animation: { duration: 300 } })
                } else {
                    editor.setCamera(
                        { x: -x + window.innerWidth / 2, y: -y + window.innerHeight / 2, z: 1 },
                        { animation: { duration: 300 } }
                    )
                }
            } catch {
                editor.setCamera(
                    { x: -x + window.innerWidth / 2, y: -y + window.innerHeight / 2, z: 1 },
                    { animation: { duration: 300 } }
                )
            }
        }
        return () => { jumpRef.current = null }
    }, [editor, jumpRef])

    const generateThumbnail = useCallback(async (): Promise<string | null> => {
        try {
            const shapeIds = editor.getCurrentPageShapeIds()
            if (shapeIds.size === 0) return null
            const result = await editor.getSvgString([...shapeIds], { padding: 10, scale: 0.2 })
            return result?.svg ?? null
        } catch { return null }
    }, [editor])

    const saveDebounce = useMemo(() => {
        let timer: any
        return (snap: TLEditorSnapshot) => {
            clearTimeout(timer)
            timer = setTimeout(async () => { onSaveBoard(snap, await generateThumbnail()) }, 500)
        }
    }, [generateThumbnail, onSaveBoard])

    useEffect(() => {
        if (!editor) return
        return editor.store.listen(() => {
            saveDebounce(getSnapshot(editor.store) as TLEditorSnapshot)
        }, { scope: 'document' })
    }, [editor, saveDebounce])

    return (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <TldrawToolPanel {...cardCreators} />
            <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 8, pointerEvents: 'auto', zIndex: 100 }}>
                {/* @ts-ignore */}
                {window.electronAPI && (
                    <button onClick={() => window.electronAPI.saveDocument(JSON.stringify({ snapshot: getSnapshot(editor.store) }))}>儲存</button>
                )}
                <button onClick={() => exportJSON(getSnapshot(editor.store) as TLEditorSnapshot, board.name)}>匯出 JSON</button>

                {/* 匯出圖片/PDF 下拉選單 */}
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowExportMenu(v => !v)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                        匯出圖片 ▾
                    </button>
                    {showExportMenu && (
                        <div
                            style={{
                                position: 'absolute', top: '110%', right: 0,
                                background: 'white', borderRadius: 10, padding: '4px 0',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)',
                                minWidth: 180, zIndex: 9999, whiteSpace: 'nowrap',
                            }}
                            onMouseLeave={() => setShowExportMenu(false)}
                        >
                            {[
                                { label: '🖼️ 整個白板 → PNG', fn: () => exportPNG(false) },
                                { label: '🖼️ 選取卡片 → PNG', fn: () => exportPNG(true) },
                                { label: '📄 整個白板 → PDF', fn: () => exportPDF(false) },
                                { label: '📄 選取卡片 → PDF', fn: () => exportPDF(true) },
                            ].map(({ label, fn }) => (
                                <div
                                    key={label}
                                    onClick={() => { fn(); setShowExportMenu(false) }}
                                    style={{
                                        padding: '8px 16px', cursor: 'pointer', fontSize: 13,
                                        transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    {label}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <input type="file" accept="application/json"
                    onChange={e => { const f = e.target.files?.[0]; if (f) importJSON(f, d => loadSnapshot(editor.store, d.snapshot!)) }}
                    style={{ pointerEvents: 'auto' }}
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
            {/* 右鍵選單 — 獨立於 pointerEvents:none 容器之外 */}
            <div style={{ pointerEvents: 'auto' }}>
                {menuElement}
            </div>
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
    const [navigationStack, setNavigationStack] = useState<string[]>([])  // 導航歷史
    const jumpRef = useRef<((shapeId: string, x: number, y: number) => void) | null>(null)

    useEffect(() => {
        loadAllBoards().then(loaded => {
            setBoards(loaded)
            const firstId = loaded[0]?.id ?? null
            setActiveBoardId(firstId)
            if (firstId) setNavigationStack([firstId])
            setLoading(false)
        })
    }, [])

    // Cmd+Shift+O 開啟/關閉總覽
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
                e.preventDefault()
                setOverviewOpen(prev => !prev)
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

    const handleCreateBoard = useCallback((name: string, parentId?: string): BoardRecord => {
        const newBoard: BoardRecord = { id: generateId(), name, snapshot: null, thumbnail: null, updatedAt: Date.now(), parentId: parentId ?? null }
        saveBoard(newBoard)
        setBoards(prev => [...prev, newBoard])
        return newBoard
    }, [])

    // 一般切換（Tab 點擊）：重置導航堆疊
    const handleSwitch = useCallback((id: string) => {
        if (id !== activeBoardId) {
            setActiveBoardId(id)
            setNavigationStack([id])
        }
    }, [activeBoardId])

    // 進入子板（Board 卡片雙擊）：疊加導航堆疊
    const handleSwitchToChild = useCallback((childId: string) => {
        setActiveBoardId(childId)
        setNavigationStack(prev => {
            // 如果已經在堆疊裡，截斷到那個位置
            const idx = prev.indexOf(childId)
            if (idx >= 0) return prev.slice(0, idx + 1)
            return [...prev, childId]
        })
    }, [])

    // 返回上一層
    // 設定白板的父板
    const handleSetParent = useCallback((boardId: string, parentId: string | null) => {
        const childBoard = boards.find(b => b.id === boardId)
        setBoards(prev => prev.map(b => {
            if (b.id !== boardId) return b
            const updated = { ...b, parentId }
            saveBoard(updated)
            return updated
        }))
        if (parentId && childBoard) {
            // 切換到父板，再等 tldraw 載入後建立卡片
            setActiveBoardId(parentId)
            setNavigationStack([parentId])
            // 等白板切換完成後再發事件
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('create-board-card-on', {
                    detail: {
                        targetBoardId: parentId,
                        linkedBoardId: boardId,
                        boardName: childBoard.name,
                    }
                }))
            }, 400)
        }
        if (activeBoardId === boardId && parentId === null) {
            setNavigationStack([boardId])
        }
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
        const newBoard: BoardRecord = { id: generateId(), name: `白板 ${boards.length + 1}`, snapshot: null, thumbnail: null, updatedAt: Date.now() }
        saveBoard(newBoard)
        setBoards(prev => [...prev, newBoard])
        setActiveBoardId(newBoard.id)
        setNavigationStack([newBoard.id])
        // 在主頁自動建立這個新主板的 Board 卡片
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('create-board-card-on', {
                detail: {
                    targetBoardId: HOME_BOARD_ID,
                    linkedBoardId: newBoard.id,
                    boardName: newBoard.name,
                }
            }))
        }, 400)
    }, [boards.length])

    const handleRename = useCallback((id: string, name: string) => {
        setBoards(prev => prev.map(b => { if (b.id !== id) return b; const u = { ...b, name }; saveBoard(u); return u }))
    }, [])

    const handleDelete = useCallback((id: string) => {
        deleteBoard(id)
        setBoards(prev => {
            const next = prev.filter(b => b.id !== id)
            if (activeBoardId === id) setActiveBoardId(next[0]?.id ?? null)
            return next
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

    // ← 新增：設定 / 取消 Journal 白板
    const handleSetJournal = useCallback((boardId: string, isJournal: boolean) => {
        setBoards(prev => prev.map(b => {
            if (b.id !== boardId) return b
            const updated = { ...b, isJournal }
            saveBoard(updated)
            return updated
        }))
    }, [])

    if (loading) return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Loading...</div>

    return (
        <>
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
            />

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
                />
            )}

            {searchOpen && (
                <SearchPanel
                    boards={boards}
                    onJump={handleJump}
                    onClose={() => setSearchOpen(false)}
                />
            )}

            {hotkeyOpen && (
                <HotkeyPanel onClose={() => setHotkeyOpen(false)} />
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
        </>
    )
}