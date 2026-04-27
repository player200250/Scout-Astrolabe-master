import { useState, useEffect, useRef, useCallback } from 'react'
import type { TLEditorSnapshot } from 'tldraw'
import { db, saveAutoBackup, type BoardRecord } from '../db'
import { getISOWeekKey } from '../WeeklyReview'
import { loadAllBoards, saveBoard, deleteBoard, generateId } from '../utils/boardDb'
import { HOME_BOARD_ID, INBOX_BOARD_ID, BACKUP_THROTTLE_MS } from '../constants'

export function useBoardManager() {
    const [boards, setBoards] = useState<BoardRecord[]>([])
    const [activeBoardId, setActiveBoardId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [navigationStack, setNavigationStack] = useState<string[]>([])
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        try { return localStorage.getItem('sidebar-collapsed') === 'true' } catch { return false }
    })
    const jumpRef = useRef<((shapeId: string, x: number, y: number) => void) | null>(null)
    const lastBackupRef = useRef<number>(0)

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
    }, [])

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

    const handleSaveBoard = useCallback((snapshot: TLEditorSnapshot, thumbnail: string | null) => {
        if (!activeBoardId) return
        const board = boards.find(b => b.id === activeBoardId)
        if (!board) return
        const updated = { ...board, snapshot, thumbnail, updatedAt: Date.now() }
        saveBoard(updated)
        setBoards(prev => prev.map(b => b.id === activeBoardId ? updated : b))
    }, [activeBoardId, boards])

    const uniqueName = useCallback((base: string, currentBoards: BoardRecord[]): string => {
        const existing = new Set(currentBoards.map(b => b.name))
        if (!existing.has(base)) return base
        let n = 2
        while (existing.has(`${base} (${n})`)) n++
        return `${base} (${n})`
    }, [])

    const handleCreateBoard = useCallback((name: string, parentId?: string): BoardRecord => {
        const safeName = uniqueName(name, boards)
        const newBoard: BoardRecord = { id: generateId(), name: safeName, snapshot: null, thumbnail: null, updatedAt: Date.now(), parentId: parentId ?? null }
        saveBoard(newBoard)
        setBoards(prev => [...prev, newBoard])
        return newBoard
    }, [uniqueName, boards])

    const handleSwitch = useCallback((id: string) => {
        if (id !== activeBoardId) {
            triggerAutoBackup(boards)
            const board = boards.find(b => b.id === id)
            if (board) {
                const updated = { ...board, lastVisitedAt: Date.now() }
                saveBoard(updated)
                setBoards(prev => prev.map(b => b.id === id ? updated : b))
            }
            setActiveBoardId(id)
            setNavigationStack([id])
        }
    }, [activeBoardId, boards, triggerAutoBackup])

    const handleSwitchToChild = useCallback((childId: string) => {
        const child = boards.find(b => b.id === childId)
        if (child) {
            const updated = { ...child, lastVisitedAt: Date.now() }
            saveBoard(updated)
            setBoards(prev => prev.map(b => b.id === childId ? updated : b))
        }
        setActiveBoardId(childId)
        setNavigationStack(prev => {
            const idx = prev.indexOf(childId)
            if (idx >= 0) return prev.slice(0, idx + 1)
            return [...prev, childId]
        })
    }, [boards])

    const handleSetParent = useCallback((boardId: string, parentId: string | null) => {
        const childBoard = boards.find(b => b.id === boardId)
        if (childBoard) {
            const updated = { ...childBoard, parentId }
            saveBoard(updated)
            setBoards(prev => prev.map(b => b.id === boardId ? updated : b))
        }
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
        const name = uniqueName(`白板 ${boards.length + 1}`, boards)
        const newBoard: BoardRecord = { id: generateId(), name, snapshot: null, thumbnail: null, updatedAt: Date.now() }
        saveBoard(newBoard)
        setBoards(prev => [...prev, newBoard])
        setActiveBoardId(newBoard.id)
        setNavigationStack([newBoard.id])
    }, [uniqueName, boards])

    const handleRename = useCallback((id: string, name: string) => {
        const board = boards.find(b => b.id === id)
        if (!board) return
        const updated = { ...board, name }
        saveBoard(updated)
        setBoards(prev => prev.map(b => b.id === id ? updated : b))
    }, [boards])

    const handleDelete = useCallback((id: string) => {
        deleteBoard(id)

        const orphanChildren = boards.filter(b => b.parentId === id)
        orphanChildren.forEach(b => saveBoard({ ...b, parentId: null }))

        const next = boards
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

        setBoards(cleaned)
        window.dispatchEvent(new CustomEvent('cleanup-orphan-board-cards', { detail: { deletedBoardId: id } }))
    }, [activeBoardId, boards])

    const handleJump = useCallback((boardId: string, shapeId: string, x: number, y: number) => {
        if (boardId !== activeBoardId) {
            setActiveBoardId(boardId)
            setTimeout(() => jumpRef.current?.(shapeId, x, y), 350)
        } else {
            jumpRef.current?.(shapeId, x, y)
        }
    }, [activeBoardId])

    const handleSetJournal = useCallback((boardId: string, isJournal: boolean) => {
        const board = boards.find(b => b.id === boardId)
        if (!board) return
        const updated = { ...board, isJournal }
        saveBoard(updated)
        setBoards(prev => prev.map(b => b.id === boardId ? updated : b))
    }, [boards])

    const handleSetStatus = useCallback((boardId: string, status: 'active' | 'archived' | 'pinned') => {
        const board = boards.find(b => b.id === boardId)
        if (!board) return
        const updated = { ...board, status }
        saveBoard(updated)
        setBoards(prev => prev.map(b => b.id === boardId ? updated : b))
    }, [boards])

    const handleRestore = useCallback(async (restoredBoards: BoardRecord[]) => {
        await db.table('boards').clear()
        await Promise.all(restoredBoards.map(b => db.table('boards').put(b)))
        setBoards(restoredBoards)
        const firstId = restoredBoards[0]?.id ?? null
        setActiveBoardId(firstId)
        if (firstId) setNavigationStack([firstId])
    }, [])

    const handleGoToWeeklyCard = useCallback(() => {
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
        const board = boards.find(b => b.id === boardId)
        if (!board) return

        const snapshot: any = board.snapshot
            ? structuredClone(board.snapshot)
            : { document: { store: {}, schema: { schemaVersion: 2, sequences: {} } }, session: {} }

        if (!snapshot.document) snapshot.document = { store: {}, schema: { schemaVersion: 2, sequences: {} } }
        if (!snapshot.document.store) snapshot.document.store = {}
        const store = snapshot.document.store

        if (shapeId && store[shapeId]) {
            store[shapeId].props.text = html
        } else {
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
                    image: null, todos: [], url: '',
                    linkEmbedUrl: null, journalDate: dateStr,
                    state: 'idle', color: 'yellow', w: 280, h: 380,
                    cardStatus: 'none', priority: 'none', tags: [],
                },
            }
        }
        const updated = { ...board, snapshot, updatedAt: Date.now() }
        saveBoard(updated)
        setBoards(prev => prev.map(b => b.id === boardId ? updated : b))
    }, [boards])

    const handleMoveCardToBoard = useCallback((shapeId: string, targetBoardId: string) => {
        const inboxBoard = boards.find(b => b.isInbox)
        if (!inboxBoard?.snapshot) return
        const srcStore = (inboxBoard.snapshot as any).document?.store ?? {}
        const shape = srcStore[shapeId]
        if (!shape) return

        // Compute updated inbox (shape removed)
        const newInboxStore = { ...((inboxBoard.snapshot as any).document?.store ?? {}) }
        delete newInboxStore[shapeId]
        const updatedInbox: BoardRecord = {
            ...inboxBoard,
            snapshot: {
                ...(inboxBoard.snapshot as any),
                document: { ...(inboxBoard.snapshot as any).document, store: newInboxStore },
            } as TLEditorSnapshot,
            updatedAt: Date.now(),
        }
        saveBoard(updatedInbox)

        // Compute updated target (shape inserted)
        const targetBoard = boards.find(b => b.id === targetBoardId)
        let updatedTarget: BoardRecord | null = null
        if (targetBoard) {
            const snap: any = targetBoard.snapshot
                ? structuredClone(targetBoard.snapshot)
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
            updatedTarget = { ...targetBoard, snapshot: snap as TLEditorSnapshot, updatedAt: Date.now() }
            saveBoard(updatedTarget)
        }

        setBoards(prev => prev.map(b => {
            if (b.id === inboxBoard.id) return updatedInbox
            if (updatedTarget && b.id === targetBoardId) return updatedTarget
            return b
        }))

        window.dispatchEvent(new CustomEvent('delete-shape-from-editor', { detail: { shapeId } }))
    }, [boards])

    const handleGoToInbox = useCallback(() => {
        setActiveBoardId(INBOX_BOARD_ID)
        setNavigationStack([INBOX_BOARD_ID])
    }, [])

    const handleReorderBoards = useCallback((activeId: string, overId: string) => {
        const sortable = boards.filter(b => !b.isHome && !b.isInbox && !b.parentId && b.status !== 'archived' && b.status !== 'pinned')
        const oldIndex = sortable.findIndex(b => b.id === activeId)
        const newIndex = sortable.findIndex(b => b.id === overId)
        if (oldIndex === -1 || newIndex === -1) return

        const reordered = [...sortable]
        const [moved] = reordered.splice(oldIndex, 1)
        reordered.splice(newIndex, 0, moved)

        const reorderedWithOrder = reordered.map((b, i) => ({ ...b, sortOrder: i }))
        reorderedWithOrder.forEach(b => saveBoard(b))

        const sortableIds = new Set(sortable.map(b => b.id))
        const others = boards.filter(b => !sortableIds.has(b.id))
        setBoards([...others, ...reorderedWithOrder])
    }, [boards])

    return {
        boards,
        activeBoardId,
        loading,
        navigationStack,
        sidebarCollapsed,
        jumpRef,
        handleSaveBoard,
        handleCreateBoard,
        handleSwitch,
        handleSwitchToChild,
        handleSetParent,
        handleBack,
        handleNew,
        handleRename,
        handleDelete,
        handleJump,
        handleSetJournal,
        handleSetStatus,
        handleRestore,
        handleGoToWeeklyCard,
        handleSaveJournal,
        handleMoveCardToBoard,
        handleToggleCollapse,
        handleGoToInbox,
        handleReorderBoards,
    }
}
