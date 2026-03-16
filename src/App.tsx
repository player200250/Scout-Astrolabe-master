// src/App.tsx
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
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
}

const generateId = () => `board_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

const loadAllBoards = async (): Promise<BoardRecord[]> => {
    const boards = await db.table('boards').toArray()
    if (boards.length === 0) {
        const oldSnapshot = await db.table('snapshots').get('latest')
        const firstBoard: BoardRecord = {
            id: generateId(),
            name: '我的白板',
            snapshot: oldSnapshot?.snapshot ?? null,
            thumbnail: null,
            updatedAt: Date.now(),
        }
        await db.table('boards').put(firstBoard)
        return [firstBoard]
    }
    return boards.sort((a, b) => a.updatedAt - b.updatedAt)
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
}

function BoardTabBar({ boards, activeBoardId, onSwitch, onNew, onRename, onDelete, onSearch, onHotkey }: BoardTabBarProps) {
    const [hoveredId, setHoveredId] = useState<string | null>(null)
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')

    const startRename = (board: BoardRecord) => { setRenamingId(board.id); setRenameValue(board.name) }
    const commitRename = (id: string) => { if (renameValue.trim()) onRename(id, renameValue.trim()); setRenamingId(null) }

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, height: 48,
            background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(8px)',
            borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center',
            gap: 4, paddingLeft: 12, paddingRight: 12, zIndex: 10000, overflowX: 'auto',
        }}>
            {boards.map(board => (
                <div
                    key={board.id}
                    onMouseEnter={() => setHoveredId(board.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => onSwitch(board.id)}
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
                        >{board.name}</span>
                    )}

                    {hoveredId === board.id && boards.length > 1 && (
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

            <button onClick={onNew} style={{
                width: 28, height: 28, borderRadius: 8, border: '1px dashed #ccc',
                background: 'transparent', cursor: 'pointer', fontSize: 18, color: '#aaa',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0,
            }} title="新增白板">+</button>

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
        editor.createShape({
            type: 'card', x, y,
            props: {
                type: 'column', text: '',
                image: null, blobUrl: null, todos: [],
                url: '', linkEmbedUrl: null,
                state: 'idle', color: 'none', w: 260, h: 480,
            }
        })
        // Column 永遠在最底層，讓其他卡片可以放在上面
        requestAnimationFrame(() => {
            const shapes = editor.getCurrentPageShapes()
            const col = shapes[shapes.length - 1]
            if (col) editor.sendToBack([col.id])
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
    const jumpRef = useRef<((shapeId: string, x: number, y: number) => void) | null>(null)

    useEffect(() => {
        loadAllBoards().then(loaded => {
            setBoards(loaded)
            setActiveBoardId(loaded[0]?.id ?? null)
            setLoading(false)
        })
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

    const handleCreateBoard = useCallback((name: string): BoardRecord => {
        const newBoard: BoardRecord = { id: generateId(), name, snapshot: null, thumbnail: null, updatedAt: Date.now() }
        saveBoard(newBoard)
        setBoards(prev => [...prev, newBoard])
        return newBoard
    }, [])

    const handleSwitch = useCallback((id: string) => { if (id !== activeBoardId) setActiveBoardId(id) }, [activeBoardId])

    const handleNew = useCallback(() => {
        const newBoard: BoardRecord = { id: generateId(), name: `白板 ${boards.length + 1}`, snapshot: null, thumbnail: null, updatedAt: Date.now() }
        saveBoard(newBoard)
        setBoards(prev => [...prev, newBoard])
        setActiveBoardId(newBoard.id)
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
                    onCreateBoard={handleCreateBoard}
                    onSwitchBoard={handleSwitch}
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
        </>
    )
}