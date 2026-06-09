import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useEditor, getSnapshot, loadSnapshot, exportToBlob, createShapeId } from 'tldraw'
import type { TLEditorSnapshot, TLShapeId } from 'tldraw'
import { jsPDF } from 'jspdf'
import { db } from '../db'
import type { BoardRecord } from '../db'
import type { HomeView } from './Whiteboard'
import TldrawToolPanel, { type CardCreators } from '../TIdrawToolPanel'
import { useContextMenu } from '../utils/contextMenuUtils'
import { useHotkeys } from '../Usehotkeys'
import { getISOWeekKey, getWeekRange } from '../utils/weeklyReviewUtils'
import { exportJSON, importJSON } from '../utils/boardExport'
import { exportBoardToMarkdown, exportSelectedToMarkdown } from '../utils/exportMarkdown'
import type { TLCardShape, StickyColor, TableRow } from './card-shape/type/CardShape'
import { getEmbedData, fetchLinkMeta } from './card-shape/utils/embedUtils'
import { saveCardToTrash, getCardPreview } from '../utils/trashUtils'
import { sanitizeSnapshot, sanitizeCardProps } from '../utils/snapshot'
import type { SnapshotShapeProps } from '../utils/snapshot'
import { JUMP_DELAY_MS, Z_TOOL_SUBMENU } from '../constants'
import { emitAppEvent, onAppEvent } from '../utils/appEvents'
import { getExportBtnStyle } from '../utils/whiteboardUtils'

function isCardShape(s: { type: string }): s is TLCardShape {
    return s.type === 'card'
}

async function compressImage(dataUrl: string): Promise<string> {
    return new Promise(resolve => {
        let settled = false
        const done = (result: string) => { if (!settled) { settled = true; resolve(result) } }
        setTimeout(() => done(dataUrl), 5000)
        const img = new Image()
        img.onload = () => {
            const MAX = 1200
            let { width, height } = img
            if (width > MAX || height > MAX) {
                if (width > height) { height = Math.round(height * MAX / width); width = MAX }
                else { width = Math.round(width * MAX / height); height = MAX }
            }
            const canvas = document.createElement('canvas')
            canvas.width = width; canvas.height = height
            const ctx = canvas.getContext('2d')!
            ctx.drawImage(img, 0, 0, width, height)
            // Preserve transparency for PNG; convert to JPEG otherwise
            if (dataUrl.startsWith('data:image/png')) {
                const px = ctx.getImageData(0, 0, width, height).data
                for (let i = 3; i < px.length; i += 4) {
                    if (px[i] < 255) { done(canvas.toDataURL('image/png')); return }
                }
            }
            done(canvas.toDataURL('image/jpeg', 0.8))
        }
        img.onerror = () => done(dataUrl)
        img.src = dataUrl
    })
}

interface WhiteboardToolsProps {
    board: BoardRecord
    boards: BoardRecord[]
    onSaveBoard: (snapshot: TLEditorSnapshot, thumbnail: string | null) => void
    jumpRef: React.MutableRefObject<((shapeId: string, x: number, y: number) => void) | null>
    onOpenSearch: () => void
    onOpenHotkey: () => void
    onOpenQuickSwitcher?: () => void
    onCreateBoard: (name: string) => BoardRecord
    onSwitchBoard: (id: string) => void
    isInboxBoard: boolean
    onMoveCard: (shapeId: string) => void
    isDark: boolean
    homeView?: HomeView
    onSetHomeView?: (v: HomeView) => void
    onCardTrashed?: () => void
    recentlyTrashedShapeIds: React.MutableRefObject<Set<string>>
}

export function WhiteboardTools({ board, boards, onSaveBoard, jumpRef, onOpenSearch, onOpenHotkey, onOpenQuickSwitcher, onCreateBoard, onSwitchBoard, isInboxBoard, onMoveCard, isDark, homeView, onSetHomeView, onCardTrashed, recentlyTrashedShapeIds }: WhiteboardToolsProps) {
    const editor = useEditor()
    const initialized = useRef(false)
    const imageInputRef = useRef<HTMLInputElement>(null)
    const jsonInputRef = useRef<HTMLInputElement>(null)

    const createTextCard = useCallback((x?: number, y?: number) => {
        editor.createShape({ type: 'card', x, y, props: { type: 'text', text: '', image: null, todos: [], url: '', state: 'idle', w: 280, h: 320 } })
    }, [editor])

    const createTodoCard = useCallback((x?: number, y?: number) => {
        editor.createShape({ type: 'card', x, y, props: { type: 'todo', text: '', image: null, todos: [{ id: `todo_${Date.now()}`, text: '新任務', checked: false }], url: null, state: 'idle', w: 280, h: 320 } })
    }, [editor])

    const createLinkCard = useCallback((x?: number, y?: number) => {
        editor.createShape({ type: 'card', x, y, props: { type: 'link', text: '', image: null, todos: [], url: 'https://example.com', linkEmbedUrl: null, state: 'idle', color: 'none', cardStatus: 'none', priority: 'none', tags: [], w: 280, h: 200 } })
    }, [editor])

    const createImageCard = useCallback((imgBase64: string) => {
        editor.createShape({ type: 'card', props: { type: 'image', text: '', image: imgBase64, todos: [], url: '', state: 'idle', w: 280, h: 200 } })
    }, [editor])

    const createHeadingCard = useCallback((x?: number, y?: number) => {
        const center = editor.getViewportScreenCenter()
        const pageCenter = editor.screenToPage(center)
        editor.createShape({ type: 'card', x: x ?? pageCenter.x - 160, y: y ?? pageCenter.y - 30, props: { type: 'heading', text: '標題', image: null, todos: [], url: '', linkEmbedUrl: null, state: 'idle', color: 'none', cardStatus: 'none', priority: 'none', tags: [], w: 320, h: 60 } })
    }, [editor])

    const createStickyCard = useCallback((color: StickyColor = 'yellow', x?: number, y?: number) => {
        const center = editor.getViewportScreenCenter()
        const pageCenter = editor.screenToPage(center)
        editor.createShape({ type: 'card', x: x ?? pageCenter.x - 100, y: y ?? pageCenter.y - 100, props: { type: 'sticky', text: '', image: null, todos: [], url: '', linkEmbedUrl: null, state: 'idle', color, cardStatus: 'none', priority: 'none', tags: [], w: 200, h: 200 } })
    }, [editor])

    const createFileCard = useCallback(async (x?: number, y?: number) => {
        if (!window.electronAPI?.selectAndCopyFile) return
        const result = await window.electronAPI.selectAndCopyFile()
        if (!result) return
        const center = editor.getViewportScreenCenter()
        const pageCenter = editor.screenToPage(center)
        editor.createShape({
            type: 'card',
            x: x ?? pageCenter.x - 80,
            y: y ?? pageCenter.y - 90,
            props: {
                type: 'file', text: '', image: null, todos: [], url: '', linkEmbedUrl: null,
                state: 'idle', color: 'none', cardStatus: 'none', priority: 'none', tags: [],
                w: 160, h: 180,
                storedName: result.storedName,
                originalName: result.originalName,
                fileSize: result.size,
                fileExt: result.ext,
            },
        })
    }, [editor])

    const createColorCard = useCallback((x?: number, y?: number) => {
        const center = editor.getViewportScreenCenter()
        const pageCenter = editor.screenToPage(center)
        const ts = Date.now()
        editor.createShape({
            type: 'card',
            x: x ?? pageCenter.x - 140,
            y: y ?? pageCenter.y - 100,
            props: {
                type: 'color', text: '', image: null, todos: [], url: '', linkEmbedUrl: null,
                state: 'idle', color: 'none', cardStatus: 'none', priority: 'none', tags: [],
                w: 280, h: 200,
                swatches: [{ id: `sw_${ts}`, hex: '#3B82F6', name: '' }],
            },
        })
    }, [editor])

    const createTableCard = useCallback((cols: number = 3, x?: number, y?: number) => {
        const center = editor.getViewportScreenCenter()
        const pageCenter = editor.screenToPage(center)
        const ts = Date.now()
        const colNames = Array.from({ length: cols }, (_, i) => `欄位 ${i + 1}`)
        const headerRow: TableRow = {
            id: `row_${ts}_0`,
            cells: colNames.map((name, i) => ({ id: `cell_${ts}_0_${i}`, content: name })),
        }
        const dataRows: TableRow[] = Array.from({ length: 3 }, (_, r) => ({
            id: `row_${ts}_${r + 1}`,
            cells: Array.from({ length: cols }, (_, c) => ({ id: `cell_${ts}_${r + 1}_${c}`, content: '' })),
        }))
        const tableData = [headerRow, ...dataRows]
        const h = 40 + 3 * 36 + 32  // header + 3 data rows + footer = 180
        editor.createShape({
            type: 'card',
            x: x ?? pageCenter.x - 200,
            y: y ?? pageCenter.y - 90,
            props: {
                type: 'table', text: '', image: null, todos: [], url: '', linkEmbedUrl: null,
                state: 'idle', color: 'none', cardStatus: 'none', priority: 'none', tags: [],
                w: 400, h,
                tableCols: cols,
                tableData,
            },
        })
    }, [editor])

    const createBoardCard = useCallback((x?: number, y?: number) => {
        const newBoard = onCreateBoard(`子白板 ${boards.length + 1}`)
        editor.createShape({
            type: 'card', x, y,
            props: { type: 'board', text: newBoard.name, image: null, todos: [], url: '', linkEmbedUrl: null, linkedBoardId: newBoard.id, state: 'idle', color: 'none', w: 280, h: 320 }
        })
    }, [editor, onCreateBoard, boards.length])

    const createColumnCard = useCallback((x?: number, y?: number) => {
        const center = editor.getViewportScreenCenter()
        const pageCenter = editor.screenToPage(center)
        editor.createShape({ type: 'frame', x: x ?? pageCenter.x - 160, y: y ?? pageCenter.y - 240, props: { w: 320, h: 480, name: '欄位' } })
    }, [editor])

    const createTextCardWithContent = useCallback((x: number, y: number, content: string, w = 280, h = 320) => {
        editor.createShape({ type: 'card', x, y, props: { type: 'text', text: content, image: null, todos: [], url: '', state: 'idle', color: 'none', cardStatus: 'none', priority: 'none', tags: [], w, h } })
    }, [editor])

    const openImageInput = useCallback(() => imageInputRef.current?.click(), [])

    const cardCreators: CardCreators = useMemo(() => ({
        createTextCard: () => createTextCard(),
        createImageCard,
        createTodoCard: () => createTodoCard(),
        createLinkCard: () => createLinkCard(),
        createBoardCard: () => createBoardCard(),
        createColumnCard: () => createColumnCard(),
        createHeadingCard: () => createHeadingCard(),
        createStickyCard: () => createStickyCard('yellow'),
        createTableCard: (cols: number) => createTableCard(cols),
        createColorCard: () => createColorCard(),
        createFileCard: () => createFileCard(),
        openImageInput,
    }), [createTextCard, createImageCard, createTodoCard, createLinkCard, createBoardCard, createColumnCard, createHeadingCard, createStickyCard, createTableCard, createColorCard, createFileCard, openImageInput])

    useEffect(() => {
        return onAppEvent('board-card-enter', ({ linkedBoardId }) => {
            if (linkedBoardId) onSwitchBoard(linkedBoardId)
        })
    }, [onSwitchBoard])

    useEffect(() => {
        return onAppEvent('cleanup-orphan-board-cards', ({ deletedBoardId }) => {
            const orphans = editor.getCurrentPageShapes()
                .filter(isCardShape)
                .filter(s => s.props.type === 'board' && s.props.linkedBoardId === deletedBoardId)
                .map(s => s.id)
            if (orphans.length > 0) editor.deleteShapes(orphans)
        })
    }, [editor])

    useEffect(() => {
        return onAppEvent('jump-to-card', ({ boardId, shapeId, x, y, targetName }) => {
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
                setTimeout(() => jumpRef.current?.(shapeId, x ?? 0, y ?? 0), JUMP_DELAY_MS)
            }
        })
    }, [boards, board.id, onSwitchBoard, jumpRef])

    useEffect(() => {
        return onAppEvent('create-board-card-on', ({ targetBoardId, linkedBoardId, boardName }) => {
            if (targetBoardId !== board.id) return
            const center = editor.getViewportScreenCenter()
            const pageCenter = editor.screenToPage(center)
            editor.createShape({
                type: 'card', x: pageCenter.x - 140, y: pageCenter.y - 100,
                props: { type: 'board', text: boardName, image: null, todos: [], url: '', linkEmbedUrl: null, linkedBoardId, state: 'idle', color: 'none', w: 280, h: 320 }
            })
        })
    }, [board.id, editor])

    const { menuElement } = useContextMenu({
        editor,
        createTextCard,
        createTodoCard,
        createLinkCard,
        createHeadingCard,
        createStickyCard,
        createTableCard,
        createColorCard,
        createFileCard,
        openImageInput,
        createTextCardWithContent,
        isInboxBoard,
        onMoveCard,
        isDark,
        boardId: board.id,
        boardName: board.name,
        onCardTrashed,
        onBeforeDeleteCard: (shapeId) => { recentlyTrashedShapeIds.current.add(shapeId) },
    })

    useEffect(() => {
        return onAppEvent('delete-shape-from-editor', ({ shapeId }) => {
            if (editor) editor.deleteShapes([shapeId as TLShapeId])
        })
    }, [editor])

    // When a shape is permanently deleted from trash, clear undo history so Ctrl+Z cannot restore it
    useEffect(() => {
        return onAppEvent('permanent-delete-shape', ({ shapeId, boardId }) => {
            if (boardId !== board.id) return
            recentlyTrashedShapeIds.current.delete(shapeId)
            editor.clearHistory()
        })
    }, [editor, board.id])

    // When Ctrl+Z restores a trashed shape, remove it from the trash DB
    useEffect(() => {
        if (!editor) return
        const cleanup = editor.store.listen(async (change) => {
            for (const [id, record] of Object.entries(change.changes.added)) {
                if (
                    (record as { typeName?: string }).typeName === 'shape' &&
                    recentlyTrashedShapeIds.current.has(id)
                ) {
                    recentlyTrashedShapeIds.current.delete(id)
                    try {
                        await db.table('deletedCards').where('shapeId').equals(id).delete()
                        emitAppEvent('trash-count-changed')
                    } catch (err) {
                        console.error('[Trash] undo sync failed', err)
                    }
                }
            }
        }, { scope: 'document' })
        return cleanup
    }, [editor])

    // Restore a card from trash back into this board's editor
    useEffect(() => {
        return onAppEvent('restore-deleted-card', ({ boardId: targetBoardId, shapeData }) => {
            if (targetBoardId !== board.id) return
            if (!shapeData || typeof shapeData !== 'object') return
            try {
                editor.createShape(shapeData as Parameters<typeof editor.createShape>[0])
            } catch {
                // shape may have changed format; skip silently
            }
        })
    }, [editor, board.id])

    useEffect(() => {
        return onAppEvent('quick-capture-card', ({ text, x, y, shapeId }) => {
            if (!isInboxBoard) return
            editor.createShape({
                id: shapeId as TLShapeId,
                type: 'card', x, y,
                props: {
                    type: 'text', text,
                    image: null, todos: [], url: '',
                    linkEmbedUrl: null, journalDate: null,
                    state: 'idle', color: 'none', w: 280, h: 320,
                    cardStatus: 'none', priority: 'none', tags: [],
                },
            })
        })
    }, [editor, isInboxBoard])

    useHotkeys(editor, {
        createTextCard: () => createTextCard(),
        createTodoCard: () => createTodoCard(),
        createLinkCard: () => createLinkCard(),
        openImageInput,
        openSearch: onOpenSearch,
        openHotkeyPanel: onOpenHotkey,
        openQuickSwitcher: onOpenQuickSwitcher,
        onDeleteShapes: (ids) => {
            const shapes = ids
                .map(id => editor.getShape(id as TLShapeId))
                .filter((s): s is NonNullable<typeof s> => !!s)
            for (const s of shapes) {
                if (s.type === 'card') {
                    const card = s as unknown as TLCardShape
                    recentlyTrashedShapeIds.current.add(s.id)
                    const sanitizedShape = { ...s, props: sanitizeCardProps(card.props as unknown as SnapshotShapeProps) }
                    saveCardToTrash(
                        s.id,
                        sanitizedShape,
                        board.id,
                        board.name,
                        card.props.type,
                        getCardPreview(card as unknown as { props: Record<string, unknown> }),
                    ).then(() => onCardTrashed?.())
                }
            }
            editor.deleteShapes(ids as TLShapeId[])
        },
    })

    useEffect(() => {
        const handlePaste = async (e: ClipboardEvent) => {
            // Yield to tldraw when a shape (link/todo/heading input) or native editable is focused
            if (editor.getEditingShapeId() !== null) return
            const target = e.target as HTMLElement
            if (target.tagName === 'TEXTAREA') return
            if (target.isContentEditable) return
            if (target.tagName === 'INPUT') return // let input's own onPaste handler take over

            const data = e.clipboardData
            if (!data) return

            // 1. Direct image file ─────────────────────────────────────────────
            const imageItem = Array.from(data.items).find(i => i.type.startsWith('image/'))
            if (imageItem) {
                e.preventDefault()
                e.stopPropagation()
                const file = imageItem.getAsFile()
                if (file) {
                    const reader = new FileReader()
                    reader.onload = async () => {
                        const compressed = await compressImage(reader.result as string)
                        const vp = editor.getViewportPageBounds()
                        editor.createShape({ type: 'card', x: vp.x + vp.w / 2 - 140, y: vp.y + vp.h / 2 - 100, props: { type: 'image', text: '', image: compressed, todos: [], url: '', state: 'idle', w: 280, h: 200 } })
                    }
                    reader.readAsDataURL(file)
                }
                return
            }

            // 2. HTML containing an <img> src (e.g. image copied from browser) ─
            const htmlText = data.getData('text/html')
            if (htmlText) {
                const match = htmlText.match(/<img[^>]+src=["']([^"']+)["']/)
                if (match) {
                    e.preventDefault()
                    e.stopPropagation()
                    const imgUrl = match[1]
                    try {
                        const res = await fetch(imgUrl)
                        const blob = await res.blob()
                        const reader = new FileReader()
                        reader.onload = async () => {
                            const compressed = await compressImage(reader.result as string)
                            const vp = editor.getViewportPageBounds()
                            editor.createShape({ type: 'card', x: vp.x + vp.w / 2 - 140, y: vp.y + vp.h / 2 - 100, props: { type: 'image', text: '', image: compressed, todos: [], url: '', state: 'idle', w: 280, h: 200 } })
                        }
                        reader.readAsDataURL(blob)
                    } catch {
                        const vp = editor.getViewportPageBounds()
                        editor.createShape({ type: 'card', x: vp.x + vp.w / 2 - 140, y: vp.y + vp.h / 2 - 100, props: { type: 'image', text: '', image: imgUrl, todos: [], url: '', state: 'idle', w: 280, h: 200 } })
                    }
                    return
                }
            }

            // 3. Plain-text URL ─────────────────────────────────────────────────
            // Use synchronous getData() so stopPropagation runs before any await
            const rawText = data.getData('text/plain').trim()
            if (!rawText) return
            let isUrl = false
            try { new URL(rawText.startsWith('http') ? rawText : `https://${rawText}`); isUrl = true } catch { /* not a URL */ }
            if (!isUrl) return // plain text → let tldraw handle normally

            e.preventDefault()
            e.stopPropagation()

            const embedData = getEmbedData(rawText)
            const { embedUrl, isEmbeddable } = embedData
            const cardW = isEmbeddable ? 400 : 280
            const cardH = isEmbeddable ? 300 : 200
            const viewport = editor.getViewportPageBounds()
            const x = viewport.x + viewport.w / 2 - 200  // 400寬的一半
            const y = viewport.y + viewport.h / 2 - 150  // 300高的一半
            const shapeId = createShapeId()
            editor.createShape({
                id: shapeId,
                type: 'card',
                x,
                y,
                props: {
                    type: 'link', text: '', image: null, todos: [],
                    url: rawText, linkEmbedUrl: embedUrl,
                    state: 'idle', color: 'none',
                    cardStatus: 'none', priority: 'none', tags: [],
                    w: cardW, h: cardH,
                },
            })
            const meta = await fetchLinkMeta(rawText, embedData)
            const updateProps = {
                ...(meta.title       && { title: meta.title }),
                ...(meta.description && { description: meta.description }),
                ...(meta.thumbnail   && { thumbnail: meta.thumbnail }),
            }
            if (meta.title || meta.description || meta.thumbnail) {
                editor.updateShape<TLCardShape>({ id: shapeId, type: 'card', props: updateProps })
            }
        }
        document.addEventListener('paste', handlePaste, true)
        return () => document.removeEventListener('paste', handlePaste, true)
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
        if (board.snapshot) loadSnapshot(editor.store, sanitizeSnapshot(board.snapshot))

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
                            props: { type: 'board', text: child.name, image: null, todos: [], url: '', linkEmbedUrl: null, linkedBoardId: child.id, state: 'idle', color: 'none', w: 280, h: 320 }
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
                    editor.createShape({ type: 'card', x: maxX + 320, y: 100, props: { type: 'todo', text: `${todayLabel} 計畫`, image: null, todos: [{ id: `todo_${Date.now()}`, text: '今日任務', checked: false }], url: null, linkEmbedUrl: null, journalDate: todayStr, state: 'idle', color: 'blue', w: 280, h: 320 } })
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
                            w: 280, h: 380,
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

    const saveDebounce = useCallback(() => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(async () => {
            const snap = getSnapshot(editor.store) as TLEditorSnapshot
            const thumbnail = await generateThumbnail()
            onSaveBoardRef.current(snap, thumbnail)
            saveTimerRef.current = null
        }, 500)
    }, [editor, generateThumbnail])

    useEffect(() => {
        if (!editor) return
        const cleanup = editor.store.listen(() => {
            saveDebounce()
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
                {homeView !== undefined && onSetHomeView && (
                    <>
                        <button
                            onClick={() => onSetHomeView('dashboard')}
                            style={{
                                ...getExportBtnStyle(isDark),
                                ...(homeView === 'dashboard' ? {
                                    background: '#2563eb', color: '#fff',
                                    border: '1px solid #2563eb',
                                } : {}),
                            }}
                            onMouseEnter={e => { if (homeView !== 'dashboard') e.currentTarget.style.background = isDark ? '#2d3748' : '#f0f0f0' }}
                            onMouseLeave={e => { if (homeView !== 'dashboard') e.currentTarget.style.background = isDark ? 'rgba(30,41,59,0.92)' : 'rgba(255,255,255,0.92)' }}
                        >📊 儀表板</button>
                        <button
                            onClick={() => onSetHomeView('whiteboard')}
                            style={{
                                ...getExportBtnStyle(isDark),
                                ...(homeView === 'whiteboard' ? {
                                    background: '#2563eb', color: '#fff',
                                    border: '1px solid #2563eb',
                                } : {}),
                            }}
                            onMouseEnter={e => { if (homeView !== 'whiteboard') e.currentTarget.style.background = isDark ? '#2d3748' : '#f0f0f0' }}
                            onMouseLeave={e => { if (homeView !== 'whiteboard') e.currentTarget.style.background = isDark ? 'rgba(30,41,59,0.92)' : 'rgba(255,255,255,0.92)' }}
                        >🖼️ 白板</button>
                    </>
                )}
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
                            minWidth: 180, zIndex: Z_TOOL_SUBMENU, whiteSpace: 'nowrap',
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
                    onChange={e => { const f = e.target.files?.[0]; if (f) importJSON(f, d => loadSnapshot(editor.store, sanitizeSnapshot(d.snapshot!))); e.target.value = '' }}
                />
            </div>
            <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                onChange={e => {
                    const files = Array.from(e.target.files ?? [])
                    e.target.value = ''
                    if (files.length === 0) return

                    // 多張時格狀排列（每行 4 張），整塊置中於目前視窗。
                    // 位置依索引算出，所以即使各檔壓縮完成順序不一，排列也不會重疊。
                    const COLS = 4, GAP = 20, CARD_W = 280, CARD_H = 200
                    const cols = Math.min(files.length, COLS)
                    const rows = Math.ceil(files.length / COLS)
                    const totalW = cols * CARD_W + (cols - 1) * GAP
                    const totalH = rows * CARD_H + (rows - 1) * GAP
                    const vp = editor.getViewportPageBounds()
                    const startX = vp.x + vp.w / 2 - totalW / 2
                    const startY = vp.y + vp.h / 2 - totalH / 2

                    files.forEach((file, i) => {
                        const x = startX + (i % COLS) * (CARD_W + GAP)
                        const y = startY + Math.floor(i / COLS) * (CARD_H + GAP)
                        const reader = new FileReader()
                        reader.onload = async () => {
                            const compressed = await compressImage(reader.result as string)
                            editor.createShape({ type: 'card', x, y, props: { type: 'image', text: '', image: compressed, todos: [], url: '', state: 'idle', w: CARD_W, h: CARD_H } })
                        }
                        reader.readAsDataURL(file)
                    })
                }}
            />
            <div style={{ pointerEvents: 'auto' }}>{menuElement}</div>
        </div>
    )
}
