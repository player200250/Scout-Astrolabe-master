import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useEditor, getSnapshot, loadSnapshot, exportToBlob } from 'tldraw'
import type { TLEditorSnapshot, TLShapeId } from 'tldraw'
import { jsPDF } from 'jspdf'
import type { BoardRecord } from '../db'
import TldrawToolPanel, { type CardCreators } from '../TIdrawToolPanel'
import { useContextMenu } from '../ContextMenu'
import { useHotkeys } from '../Usehotkeys'
import { getISOWeekKey, getWeekRange } from '../WeeklyReview'
import { exportJSON, importJSON } from '../utils/boardExport'
import { exportBoardToMarkdown, exportSelectedToMarkdown } from '../utils/exportMarkdown'
import type { TLCardShape } from './card-shape/type/CardShape'

function isCardShape(s: { type: string }): s is TLCardShape {
    return s.type === 'card'
}

interface WhiteboardToolsProps {
    board: BoardRecord
    boards: BoardRecord[]
    onSaveBoard: (snapshot: TLEditorSnapshot, thumbnail: string | null) => void
    jumpRef: React.MutableRefObject<((shapeId: string, x: number, y: number) => void) | null>
    onOpenSearch: () => void
    onOpenHotkey: () => void
    onCreateBoard: (name: string) => BoardRecord
    onSwitchBoard: (id: string) => void
    isInboxBoard: boolean
    onMoveCard: (shapeId: string) => void
    isDark: boolean
}

export const getExportBtnStyle = (isDark: boolean): React.CSSProperties => ({
    padding: '5px 11px',
    fontSize: 12,
    fontWeight: 500,
    color: isDark ? '#e2e8f0' : '#333',
    background: isDark ? 'rgba(30,41,59,0.92)' : 'rgba(255,255,255,0.92)',
    border: isDark ? '1px solid #475569' : '1px solid #e0e0e0',
    borderRadius: 8,
    cursor: 'pointer',
    backdropFilter: 'blur(4px)',
    boxShadow: isDark ? '0 1px 4px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.08)',
    transition: 'background 0.15s',
    whiteSpace: 'nowrap' as const,
})

/** @deprecated use getExportBtnStyle(isDark) */
export const exportBtnStyle: React.CSSProperties = getExportBtnStyle(false)

export function WhiteboardTools({ board, boards, onSaveBoard, jumpRef, onOpenSearch, onOpenHotkey, onCreateBoard, onSwitchBoard, isInboxBoard, onMoveCard, isDark }: WhiteboardToolsProps) {
    const editor = useEditor()
    const initialized = useRef(false)
    const imageInputRef = useRef<HTMLInputElement>(null)
    const jsonInputRef = useRef<HTMLInputElement>(null)

    const createTextCard = useCallback((x?: number, y?: number) => {
        editor.createShape({ type: 'card', x, y, props: { type: 'text', text: '', image: null, todos: [], url: '', state: 'idle', w: 240, h: 160 } })
    }, [editor])

    const createTodoCard = useCallback((x?: number, y?: number) => {
        editor.createShape({ type: 'card', x, y, props: { type: 'todo', text: '', image: null, todos: [{ id: `todo_${Date.now()}`, text: '新任務', checked: false }], url: null, state: 'idle', w: 260, h: 200 } })
    }, [editor])

    const createLinkCard = useCallback((x?: number, y?: number) => {
        editor.createShape({ type: 'card', x, y, props: { type: 'link', text: '', image: null, todos: [], url: 'https://example.com', state: 'idle', w: 260, h: 120 } })
    }, [editor])

    const createImageCard = useCallback((imgBase64: string) => {
        editor.createShape({ type: 'card', props: { type: 'image', text: '', image: imgBase64, todos: [], url: '', state: 'idle', w: 300, h: 200 } })
    }, [editor])

    const createBoardCard = useCallback((x?: number, y?: number) => {
        const newBoard = onCreateBoard(`子白板 ${boards.length + 1}`)
        editor.createShape({
            type: 'card', x, y,
            props: { type: 'board', text: newBoard.name, image: null, todos: [], url: '', linkEmbedUrl: null, linkedBoardId: newBoard.id, state: 'idle', color: 'none', w: 280, h: 200 }
        })
    }, [editor, onCreateBoard, boards.length])

    const createColumnCard = useCallback((x?: number, y?: number) => {
        const center = editor.getViewportScreenCenter()
        const pageCenter = editor.screenToPage(center)
        editor.createShape({ type: 'frame', x: x ?? pageCenter.x - 160, y: y ?? pageCenter.y - 240, props: { w: 320, h: 480, name: '欄位' } })
    }, [editor])

    const createTextCardWithContent = useCallback((x: number, y: number, content: string, w = 280, h = 320) => {
        console.log('[createTextCardWithContent] called', { x, y, content, w, h })
        editor.createShape({ type: 'card', x, y, props: { type: 'text', text: content, image: null, todos: [], url: '', state: 'idle', w, h } })
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
        const handleBoardEnter = (e: CustomEvent<{ linkedBoardId: string }>) => {
            const { linkedBoardId } = e.detail
            if (linkedBoardId) onSwitchBoard(linkedBoardId)
        }
        window.addEventListener('board-card-enter', handleBoardEnter)
        return () => window.removeEventListener('board-card-enter', handleBoardEnter)
    }, [onSwitchBoard])

    useEffect(() => {
        const handler = (e: CustomEvent<{ deletedBoardId: string }>) => {
            const { deletedBoardId } = e.detail
            const orphans = editor.getCurrentPageShapes()
                .filter(isCardShape)
                .filter(s => s.props.type === 'board' && s.props.linkedBoardId === deletedBoardId)
                .map(s => s.id)
            if (orphans.length > 0) editor.deleteShapes(orphans)
        }
        window.addEventListener('cleanup-orphan-board-cards', handler)
        return () => window.removeEventListener('cleanup-orphan-board-cards', handler)
    }, [editor])

    useEffect(() => {
        const handler = (e: CustomEvent<{ boardId?: string; shapeId?: string; x?: number; y?: number; targetName?: string }>) => {
            const { boardId, shapeId, x, y, targetName } = e.detail ?? {}

            if (targetName) {
                const target = boards.find(b => b.name.toLowerCase() === targetName.toLowerCase())
                if (target) onSwitchBoard(target.id)
                return
            }

            if (!shapeId) return

            if (!boardId || boardId === board.id) {
                jumpRef.current?.(shapeId, x ?? 0, y ?? 0)
            } else {
                onSwitchBoard(boardId)
                setTimeout(() => jumpRef.current?.(shapeId, x ?? 0, y ?? 0), 350)
            }
        }
        window.addEventListener('jump-to-card', handler)
        return () => window.removeEventListener('jump-to-card', handler)
    }, [boards, board.id, onSwitchBoard, jumpRef])

    useEffect(() => {
        const handler = (e: CustomEvent<{ targetBoardId: string; linkedBoardId: string; boardName: string }>) => {
            const { targetBoardId, linkedBoardId, boardName } = e.detail
            if (targetBoardId !== board.id) return
            const center = editor.getViewportScreenCenter()
            const pageCenter = editor.screenToPage(center)
            editor.createShape({
                type: 'card', x: pageCenter.x - 140, y: pageCenter.y - 100,
                props: { type: 'board', text: boardName, image: null, todos: [], url: '', linkEmbedUrl: null, linkedBoardId, state: 'idle', color: 'none', w: 280, h: 200 }
            })
        }
        window.addEventListener('create-board-card-on', handler)
        return () => window.removeEventListener('create-board-card-on', handler)
    }, [board.id, editor])

    const { menuElement } = useContextMenu({ editor, createTextCard, createTodoCard, createLinkCard, openImageInput, createTextCardWithContent, isInboxBoard, onMoveCard, isDark })

    useEffect(() => {
        const h = (e: CustomEvent<{ shapeId: string }>) => { if (editor) editor.deleteShapes([e.detail.shapeId as TLShapeId]) }
        window.addEventListener('delete-shape-from-editor', h)
        return () => window.removeEventListener('delete-shape-from-editor', h)
    }, [editor])

    useEffect(() => {
        const handler = (e: CustomEvent<{ text: string; x: number; y: number; shapeId: string }>) => {
            if (!isInboxBoard) return
            const { text, x, y, shapeId } = e.detail
            editor.createShape({
                id: shapeId as TLShapeId,
                type: 'card', x, y,
                props: {
                    type: 'text', text,
                    image: null, todos: [], url: null,
                    linkEmbedUrl: null, journalDate: null,
                    state: 'idle', color: 'none', w: 240, h: 180,
                    cardStatus: 'none', priority: 'none', tags: [],
                },
            })
        }
        window.addEventListener('quick-capture-card', handler)
        return () => window.removeEventListener('quick-capture-card', handler)
    }, [editor, isInboxBoard])

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
                        editor.createShape({ type: 'card', x: pagePoint.x - 150, y: pagePoint.y - 100, props: { type: 'image', text: '', image: base64, todos: [], url: '', state: 'idle', w: 300, h: 200 } })
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
                            editor.createShape({ type: 'card', x: pagePoint.x - 150, y: pagePoint.y - 100, props: { type: 'image', text: '', image: base64, todos: [], url: '', state: 'idle', w: 300, h: 200 } })
                        }
                        reader.readAsDataURL(blob)
                    } catch {
                        const center = editor.getViewportScreenCenter()
                        const pagePoint = editor.screenToPage(center)
                        editor.createShape({ type: 'card', x: pagePoint.x - 150, y: pagePoint.y - 100, props: { type: 'image', text: '', image: imgUrl, todos: [], url: '', state: 'idle', w: 300, h: 200 } })
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
                        editor.createShape({ type: 'card', x: pagePoint.x - 130, y: pagePoint.y - 60, props: { type: 'link', text: '', image: null, todos: [], url: trimmed, state: 'idle', w: 260, h: 120 } })
                    } catch { }
                })
            }
        }
        window.addEventListener('paste', handlePaste)
        return () => window.removeEventListener('paste', handlePaste)
    }, [editor, createImageCard])

    const exportPNG = useCallback(async (selectedOnly: boolean) => {
        const allIds = Array.from(editor.getCurrentPageShapeIds())
        const selectedIds = Array.from(editor.getSelectedShapeIds())
        const ids = selectedOnly ? selectedIds : allIds
        if (ids.length === 0) { alert(selectedOnly ? '請先選取卡片' : '白板沒有卡片'); return }
        const blob = await exportToBlob({ editor, ids, format: 'png', opts: { background: true, scale: 2 } })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `${board.name}.png`; a.click()
        URL.revokeObjectURL(url)
    }, [editor, board.name])

    const exportPDF = useCallback(async (selectedOnly: boolean) => {
        const allIds = Array.from(editor.getCurrentPageShapeIds())
        const selectedIds = Array.from(editor.getSelectedShapeIds())
        const ids = selectedOnly ? selectedIds : allIds
        if (ids.length === 0) { alert(selectedOnly ? '請先選取卡片' : '白板沒有卡片'); return }
        const blob = await exportToBlob({ editor, ids, format: 'png', opts: { background: true, scale: 2 } })
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

    const exportMarkdown = useCallback((selectedOnly: boolean) => {
        const allShapes = editor.getCurrentPageShapes()
        if (selectedOnly) {
            const selectedIds = new Set(editor.getSelectedShapeIds())
            exportSelectedToMarkdown(allShapes.filter(s => selectedIds.has(s.id)), board.name)
        } else {
            exportBoardToMarkdown(allShapes, board.name)
        }
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
                        .filter(isCardShape)
                        .filter(s => s.props.type === 'board')
                        .map(s => s.props.linkedBoardId)
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
                            props: { type: 'board', text: child.name, image: null, todos: [], url: '', linkEmbedUrl: null, linkedBoardId: child.id, state: 'idle', color: 'none', w: 280, h: 200 }
                        })
                    })
                }
            }

            if (board.isJournal) {
                const today = new Date()
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
                const weekDay = ['日', '一', '二', '三', '四', '五', '六'][today.getDay()]
                const todayLabel = `${today.getMonth() + 1}/${today.getDate()}（${weekDay}）`
                const alreadyExists = editor.getCurrentPageShapes().filter(isCardShape).some(s => s.props.journalDate === todayStr)
                if (!alreadyExists) {
                    const allShapes = editor.getCurrentPageShapes().filter(isCardShape)
                    const maxX = allShapes.length > 0 ? Math.max(...allShapes.map(s => s.x + s.props.w)) + 40 : 100
                    const journalText = `<h2>${todayLabel}</h2><p><strong>今天做了什麼</strong></p><p></p><p><strong>學到什麼（在哪個白板）</strong></p><p></p><p><strong>計畫/待辦</strong></p><p></p><p><strong>卡住的地方</strong></p><p></p><p><strong>明天先做</strong></p><p></p>`
                    editor.createShape({ type: 'card', x: maxX, y: 100, props: { type: 'journal', text: journalText, image: null, todos: [], url: '', linkEmbedUrl: null, journalDate: todayStr, state: 'idle', color: 'yellow', w: 280, h: 380 } })
                    editor.createShape({ type: 'card', x: maxX + 320, y: 100, props: { type: 'todo', text: `${todayLabel} 計畫`, image: null, todos: [{ id: `todo_${Date.now()}`, text: '今日任務', checked: false }], url: null, linkEmbedUrl: null, journalDate: todayStr, state: 'idle', color: 'blue', w: 260, h: 200 } })
                }

                const weekKey = getISOWeekKey(today)
                const weeklyExists = editor.getCurrentPageShapes().filter(isCardShape).some(s => s.props.journalDate === weekKey)
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
                            image: null, todos: [], url: '', linkEmbedUrl: null,
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
                const shape = editor.getShape(shapeId as TLShapeId)
                if (shape) { editor.select(shapeId as TLShapeId); editor.zoomToSelection({ animation: { duration: 300 } }) }
                else { editor.setCamera({ x: -x + window.innerWidth / 2, y: -y + window.innerHeight / 2, z: 1 }, { animation: { duration: 300 } }) }
            } catch {
                editor.setCamera({ x: -x + window.innerWidth / 2, y: -y + window.innerHeight / 2, z: 1 }, { animation: { duration: 300 } })
            }
        }
        return () => { jumpRef.current = null }
    }, [editor, jumpRef])

    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Always keep a ref to the latest onSaveBoard so saveDebounce never captures a stale closure.
    // Without this, every boards-state update recreates onSaveBoard → recreates saveDebounce →
    // the store-listener effect cleanup cancels the pending 500 ms timer → edits are lost.
    const onSaveBoardRef = useRef(onSaveBoard)
    onSaveBoardRef.current = onSaveBoard

    const generateThumbnail = useCallback(async (): Promise<string | null> => {
        try {
            const shapeIds = [...editor.getCurrentPageShapeIds()]
            if (shapeIds.length === 0) return null
            const blob = await exportToBlob({ editor, ids: shapeIds, format: 'png', opts: { background: true, scale: 0.15 } })
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
            onSaveBoardRef.current(snap, thumbnail)
            saveTimerRef.current = null
        }, 500)
    }, [generateThumbnail])

    useEffect(() => {
        if (!editor) return
        const cleanup = editor.store.listen(() => {
            saveDebounce(getSnapshot(editor.store) as TLEditorSnapshot)
        }, { scope: 'document' })
        return () => {
            cleanup()
            if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
        }
    }, [editor, saveDebounce])

    return (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <TldrawToolPanel {...cardCreators} isDark={isDark} />
            <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6, pointerEvents: 'auto', zIndex: 100 }}>
                {window.electronAPI && (
                    <button
                        onClick={() => window.electronAPI?.saveDocument(JSON.stringify({ snapshot: getSnapshot(editor.store) }))}
                        style={getExportBtnStyle(isDark)}
                        onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#2d3748' : '#f0f0f0')}
                        onMouseLeave={e => (e.currentTarget.style.background = isDark ? 'rgba(30,41,59,0.92)' : 'rgba(255,255,255,0.92)')}
                    >儲存</button>
                )}
                <button
                    onClick={() => exportJSON(getSnapshot(editor.store) as TLEditorSnapshot, board.name)}
                    style={getExportBtnStyle(isDark)}
                    onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#2d3748' : '#f0f0f0')}
                    onMouseLeave={e => (e.currentTarget.style.background = isDark ? 'rgba(30,41,59,0.92)' : 'rgba(255,255,255,0.92)')}
                >匯出 JSON</button>
                <button
                    onClick={() => jsonInputRef.current?.click()}
                    style={getExportBtnStyle(isDark)}
                    onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#2d3748' : '#f0f0f0')}
                    onMouseLeave={e => (e.currentTarget.style.background = isDark ? 'rgba(30,41,59,0.92)' : 'rgba(255,255,255,0.92)')}
                >匯入 JSON</button>
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowExportMenu(v => !v)}
                        style={{ ...getExportBtnStyle(isDark), display: 'flex', alignItems: 'center', gap: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#2d3748' : '#f0f0f0')}
                        onMouseLeave={e => (e.currentTarget.style.background = isDark ? 'rgba(30,41,59,0.92)' : 'rgba(255,255,255,0.92)')}
                    >匯出圖片 ▾</button>
                    {showExportMenu && (
                        <div style={{
                            position: 'absolute', top: '110%', right: 0, borderRadius: 10, padding: '4px 0',
                            background: isDark ? '#1e293b' : 'white',
                            boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)' : '0 4px 20px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)',
                            minWidth: 180, zIndex: 9999, whiteSpace: 'nowrap',
                        }} onMouseLeave={() => setShowExportMenu(false)}>
                            {[
                                { label: '🖼️ 整個白板 → PNG', fn: () => exportPNG(false) },
                                { label: '🖼️ 選取卡片 → PNG', fn: () => exportPNG(true) },
                                { label: '📄 整個白板 → PDF', fn: () => exportPDF(false) },
                                { label: '📄 選取卡片 → PDF', fn: () => exportPDF(true) },
                                { label: '📝 整個白板 → Markdown', fn: () => exportMarkdown(false) },
                                { label: '📝 選取卡片 → Markdown', fn: () => exportMarkdown(true) },
                            ].map(({ label, fn }) => (
                                <div key={label} onClick={() => { fn(); setShowExportMenu(false) }}
                                    style={{ padding: '8px 16px', cursor: 'pointer', fontSize: 13, color: isDark ? '#e2e8f0' : '#1a1a1a' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#2d3748' : '#f5f5f5')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >{label}</div>
                            ))}
                        </div>
                    )}
                </div>
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
