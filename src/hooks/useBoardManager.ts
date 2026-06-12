import { useState, useEffect, useCallback } from 'react'
import { db, type BoardRecord } from '../db'
import type { DeletedCardRecord } from '../db'
import { getISOWeekKey } from '../utils/weeklyReviewUtils'
import { loadAllBoards, saveBoard, deleteBoard, generateId } from '../utils/boardDb'
import { JUMP_DELAY_MS } from '../constants'
import { emitAppEvent } from '../utils/appEvents'
import {
    getSnapshotStore, withUpdatedStore, toMutableSnapshot, toTLEditorSnapshot,
} from '../utils/snapshot'
import { cleanupOrphanBoardCards, sanitizeBoards } from '../utils/boardSanitize'
import { useAutoBackup } from './useAutoBackup'
import { useSidebar } from './useSidebar'
import { useTrash } from './useTrash'
import { useNavigation } from './useNavigation'
import { useBoardCRUD, uniqueName } from './useBoardCRUD'

const TRASH_EXPIRE_MS = 14 * 86400000

export function useBoardManager() {
    const [boards, setBoards] = useState<BoardRecord[]>([])
    const [activeBoardId, setActiveBoardId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const { triggerAutoBackup } = useAutoBackup(boards)
    const { sidebarCollapsed, handleToggleCollapse } = useSidebar()
    const {
        trashCount, recentlyTrashedShapeIds, refreshTrashCount,
        handleSoftDeleteBoard, handleDelete, handleRestoreBoard,
        handleEmptyTrash, handleCardTrashed,
    } = useTrash({ boards, setBoards, activeBoardId, setActiveBoardId })
    const {
        navigationStack, setNavigationStack, jumpRef,
        handleBack, handleJump, handleGoToInbox,
    } = useNavigation({ activeBoardId, setActiveBoardId })
    const {
        handleSaveBoard, handleCreateBoard, handleRename,
        handleSetStatus, handleReorderBoards,
    } = useBoardCRUD({ boards, setBoards, activeBoardId })

    useEffect(() => {
        navigator.storage?.persist?.().then(granted => {
            if (!granted) console.warn('[Storage] 持久化未授權，資料可能被清除')
        })
        loadAllBoards().then(async loaded => {
            // Auto-cleanup expired trash items
            const cutoff = Date.now() - TRASH_EXPIRE_MS
            const expiredBoards = loaded.filter(b => b.deletedAt && b.deletedAt < cutoff)
            for (const b of expiredBoards) await deleteBoard(b.id)
            try {
                const expiredCards: DeletedCardRecord[] = await db.table('deletedCards').where('deletedAt').below(cutoff).toArray()
                for (const c of expiredCards) {
                    if (c.type === 'file') {
                        const props = (c.shapeData as { props?: { storedName?: string } })?.props
                        if (props?.storedName) window.electronAPI?.deleteFile(props.storedName)
                    }
                    await db.table('deletedCards').delete(c.id)
                }
            } catch { /* table may not exist on first run before migration */ }

            const active = loaded.filter(b => !b.deletedAt)
            const sanitized = await sanitizeBoards(active)
            setBoards(sanitized)
            const firstId = sanitized[0]?.id ?? null
            setActiveBoardId(firstId)
            if (firstId) setNavigationStack([firstId])
            setLoading(false)
            refreshTrashCount()
        })
    }, [])

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
                emitAppEvent('create-board-card-on', { targetBoardId: parentId, linkedBoardId: boardId, boardName: childBoard.name })
            }, 400)
        }
        if (activeBoardId === boardId && parentId === null) setNavigationStack([boardId])
    }, [activeBoardId, boards])

    const handleNew = useCallback(() => {
        const name = uniqueName(`白板 ${boards.length + 1}`, boards)
        const newBoard: BoardRecord = { id: generateId(), name, snapshot: null, thumbnail: null, updatedAt: Date.now() }
        saveBoard(newBoard)
        setBoards(prev => [...prev, newBoard])
        setActiveBoardId(newBoard.id)
        setNavigationStack([newBoard.id])
    }, [boards])

    const handlePermanentDeleteBoard = useCallback(async (id: string) => {
        try {
            await deleteBoard(id)
        } catch (err) {
            console.error('[handlePermanentDeleteBoard] DB 刪除失敗', err)
            alert('刪除失敗，請重試。')
            return
        }

        const orphanChildren = boards.filter(b => b.parentId === id)
        orphanChildren.forEach(b => saveBoard({ ...b, parentId: null }))

        const next = boards
            .filter(b => b.id !== id)
            .map(b => b.parentId === id ? { ...b, parentId: null } : b)

        if (activeBoardId === id) setActiveBoardId(next[0]?.id ?? null)

        const cleaned = next.map(b => {
            if (!b.snapshot) return b
            const newSnap = cleanupOrphanBoardCards(b.snapshot, id)
            if (newSnap === b.snapshot) return b
            const updated = { ...b, snapshot: newSnap }
            saveBoard(updated)
            return updated
        })

        setBoards(cleaned)
        emitAppEvent('cleanup-orphan-board-cards', { deletedBoardId: id })
        refreshTrashCount()
    }, [activeBoardId, boards, refreshTrashCount])

    const handleSoftDeleteBoardWithInboxMove = useCallback(async (boardId: string, moveToInbox: boolean) => {
        const board = boards.find(b => b.id === boardId)
        if (!board) return

        let inboxUpdated: BoardRecord | null = null

        if (moveToInbox && board.snapshot) {
            const inboxBoard = boards.find(b => b.isInbox)
            if (inboxBoard) {
                const srcStore = getSnapshotStore(board.snapshot)
                const cardShapes = Object.values(srcStore).filter(
                    s => s.typeName === 'shape' && s.type === 'card'
                )

                if (cardShapes.length > 0) {
                    const snap = toMutableSnapshot(inboxBoard.snapshot)
                    const st = snap.document.store

                    if (!st['document:document']) {
                        st['document:document'] = { typeName: 'document', id: 'document:document', gridSize: 10, name: '', meta: {} }
                    }
                    const pageRec = Object.values(st).find(r => r.typeName === 'page')
                    const pageId = pageRec?.id ?? 'page:page'
                    if (!st[pageId]) st[pageId] = { typeName: 'page', id: pageId, name: '', index: 'a1', meta: {} }

                    const existingShapes = Object.values(st).filter(r => r.typeName === 'shape')
                    const existingIndices = existingShapes
                        .map(r => r.index)
                        .filter((idx): idx is string => idx !== undefined)
                        .sort()
                    let lastIndex = existingIndices[existingIndices.length - 1] ?? 'a0'
                    let offsetX = existingShapes.length > 0
                        ? Math.max(...existingShapes.map(s => (s.x ?? 0) + (s.props?.w ?? 240))) + 40
                        : 100

                    for (const shape of cardShapes) {
                        lastIndex = lastIndex + 'V'
                        const newId = `shape:ibm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
                        st[newId] = {
                            ...structuredClone(shape),
                            id: newId,
                            parentId: pageId,
                            x: offsetX,
                            y: 100,
                            index: lastIndex,
                        }
                        offsetX += (shape.props?.w ?? 240) + 40
                    }

                    inboxUpdated = { ...inboxBoard, snapshot: toTLEditorSnapshot(snap), updatedAt: Date.now() }
                    await saveBoard(inboxUpdated)
                }
            }
        }

        const deleted = { ...board, deletedAt: Date.now() }
        await saveBoard(deleted)

        if (activeBoardId === boardId) {
            const next = boards.filter(b => b.id !== boardId)
            setActiveBoardId(next[0]?.id ?? null)
        }

        setBoards(prev => {
            const filtered = prev.filter(b => b.id !== boardId)
            if (inboxUpdated) {
                return filtered.map(b => b.id === inboxUpdated!.id ? inboxUpdated! : b)
            }
            return filtered
        })

        await refreshTrashCount()
    }, [boards, activeBoardId, refreshTrashCount])

    const handleSetJournal = useCallback((boardId: string, isJournal: boolean) => {
        const board = boards.find(b => b.id === boardId)
        if (!board) return
        const updated = { ...board, isJournal }
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
            const store = getSnapshotStore(journalBoard.snapshot)
            for (const shape of Object.values(store)) {
                if (shape.typeName === 'shape' && shape.type === 'card' && shape.props?.journalDate === weekKey) {
                    cardId = shape.id; cardX = shape.x ?? 0; cardY = shape.y ?? 0
                    break
                }
            }
        }
        if (journalBoard.id !== activeBoardId) {
            setActiveBoardId(journalBoard.id)
            setNavigationStack([journalBoard.id])
            if (cardId) setTimeout(() => jumpRef.current?.(cardId!, cardX, cardY), JUMP_DELAY_MS)
        } else if (cardId) {
            jumpRef.current?.(cardId, cardX, cardY)
        }
    }, [boards, activeBoardId, jumpRef])

    const handleSaveJournal = useCallback((boardId: string, dateStr: string, html: string, shapeId: string | null) => {
        if (!boardId) return
        const board = boards.find(b => b.id === boardId)
        if (!board) return

        const snap = toMutableSnapshot(board.snapshot)
        const store = snap.document.store

        if (shapeId && store[shapeId]) {
            const rec = store[shapeId]
            if (rec.props) { rec.props['text'] = html } else { rec.props = { text: html } }
        } else {
            if (!store['document:document']) {
                store['document:document'] = { typeName: 'document', id: 'document:document', gridSize: 10, name: '', meta: {} }
            }
            const pageRecord = Object.values(store).find(r => r.typeName === 'page')
            const pageId = pageRecord?.id ?? 'page:page'
            if (!store[pageId]) {
                store[pageId] = { typeName: 'page', id: pageId, name: '', index: 'a1', meta: {} }
            }

            const existingIndices = Object.values(store)
                .filter(r => r.typeName === 'shape')
                .map(r => r.index)
                .filter((idx): idx is string => idx !== undefined)
                .sort()
            const newIndex = (existingIndices[existingIndices.length - 1] ?? 'a0') + 'V'
            const newShapeId = `shape:jd_${dateStr.replace(/-/g, '')}_${Math.random().toString(36).slice(2, 7)}`
            const allShapes = Object.values(store).filter(r => r.typeName === 'shape')
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
                    state: 'idle', preview: '', color: 'yellow', w: 280, h: 380,
                    cardStatus: 'none', priority: 'none', tags: [],
                },
            }
        }
        const updated = { ...board, snapshot: toTLEditorSnapshot(snap), updatedAt: Date.now() }
        saveBoard(updated)
        setBoards(prev => prev.map(b => b.id === boardId ? updated : b))
    }, [boards])

    const handleMoveCardToBoard = useCallback((shapeId: string, targetBoardId: string) => {
        const inboxBoard = boards.find(b => b.isInbox)
        if (!inboxBoard?.snapshot) return
        const srcStore = getSnapshotStore(inboxBoard.snapshot)
        const shape = srcStore[shapeId]
        if (!shape) return

        // Compute updated inbox (shape removed)
        const newInboxStore = { ...srcStore }
        delete newInboxStore[shapeId]
        const updatedInbox: BoardRecord = {
            ...inboxBoard,
            snapshot: withUpdatedStore(inboxBoard.snapshot, newInboxStore),
            updatedAt: Date.now(),
        }
        saveBoard(updatedInbox)

        // Compute updated target (shape inserted)
        const targetBoard = boards.find(b => b.id === targetBoardId)
        let updatedTarget: BoardRecord | null = null
        if (targetBoard) {
            const snap = toMutableSnapshot(targetBoard.snapshot)
            const st = snap.document.store
            if (!st['document:document']) st['document:document'] = { typeName: 'document', id: 'document:document', gridSize: 10, name: '', meta: {} }
            const pageRec = Object.values(st).find(r => r.typeName === 'page')
            const pageId = pageRec?.id ?? 'page:page'
            if (!st[pageId]) st[pageId] = { typeName: 'page', id: pageId, name: '', index: 'a1', meta: {} }
            const existingShapes = Object.values(st).filter(r => r.typeName === 'shape')
            const maxX = existingShapes.length > 0 ? Math.max(...existingShapes.map(s => (s.x ?? 0) + (s.props?.w ?? 240))) + 40 : 100
            st[shapeId] = { ...structuredClone(shape), parentId: pageId, x: maxX, y: 100 }
            updatedTarget = { ...targetBoard, snapshot: toTLEditorSnapshot(snap), updatedAt: Date.now() }
            saveBoard(updatedTarget)
        }

        setBoards(prev => prev.map(b => {
            if (b.id === inboxBoard.id) return updatedInbox
            if (updatedTarget && b.id === targetBoardId) return updatedTarget
            return b
        }))

        emitAppEvent('delete-shape-from-editor', { shapeId })
    }, [boards])

    const handleAddCardToInbox = useCallback((text: string) => {
        const inboxBoard = boards.find(b => b.isInbox)
        if (!inboxBoard) return

        const snap = toMutableSnapshot(inboxBoard.snapshot)
        const store = snap.document.store

        if (!store['document:document']) {
            store['document:document'] = { typeName: 'document', id: 'document:document', gridSize: 10, name: '', meta: {} }
        }
        const pageRecord = Object.values(store).find(r => r.typeName === 'page')
        const pageId = pageRecord?.id ?? 'page:page'
        if (!store[pageId]) {
            store[pageId] = { typeName: 'page', id: pageId, name: '', index: 'a1', meta: {} }
        }

        const existingShapes = Object.values(store).filter(r => r.typeName === 'shape')
        const existingIndices = existingShapes
            .map(r => r.index)
            .filter((idx): idx is string => idx !== undefined)
            .sort()
        const newIndex = (existingIndices[existingIndices.length - 1] ?? 'a0') + 'V'
        const maxX = existingShapes.length > 0
            ? Math.max(...existingShapes.map(s => (s.x ?? 0) + (s.props?.w ?? 240))) + 40
            : 100

        const newShapeId = `shape:qc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        store[newShapeId] = {
            typeName: 'shape', id: newShapeId, type: 'card',
            x: maxX, y: 100, rotation: 0, index: newIndex,
            parentId: pageId, isLocked: false, opacity: 1, meta: {},
            props: {
                type: 'text', text,
                image: null, todos: [], url: '',
                linkEmbedUrl: null, journalDate: null,
                state: 'idle', color: 'none', w: 240, h: 180,
                cardStatus: 'none', priority: 'none', tags: [],
            },
        }

        const updated = { ...inboxBoard, snapshot: toTLEditorSnapshot(snap), updatedAt: Date.now() }
        saveBoard(updated)
        setBoards(prev => prev.map(b => b.id === inboxBoard.id ? updated : b))

        emitAppEvent('quick-capture-card', { text, x: maxX, y: 100, shapeId: newShapeId })
    }, [boards])

    const handleCreateFolder = useCallback((name: string): BoardRecord => {
        const folderName = uniqueName(name, boards)
        const folder: BoardRecord = { id: generateId(), name: folderName, snapshot: null, thumbnail: null, updatedAt: Date.now(), isFolder: true }
        saveBoard(folder)
        setBoards(prev => [...prev, folder])
        return folder
    }, [boards])

    const handleSetFolder = useCallback((boardId: string, folderId: string | null) => {
        const board = boards.find(b => b.id === boardId)
        if (!board) return
        const updated = { ...board, folderId: folderId ?? null }
        saveBoard(updated)
        setBoards(prev => prev.map(b => b.id === boardId ? updated : b))
    }, [boards])

    const handleDeleteFolder = useCallback((folderId: string) => {
        const toMove = boards.filter(b => b.folderId === folderId)
        toMove.forEach(b => saveBoard({ ...b, folderId: null }))
        deleteBoard(folderId)
        setBoards(prev => prev
            .filter(b => b.id !== folderId)
            .map(b => b.folderId === folderId ? { ...b, folderId: null } : b)
        )
    }, [boards])

    return {
        boards,
        activeBoardId,
        loading,
        navigationStack,
        sidebarCollapsed,
        jumpRef,
        trashCount,
        refreshTrashCount,
        handleSaveBoard,
        handleCreateBoard,
        handleSwitch,
        handleSwitchToChild,
        handleSetParent,
        handleBack,
        handleNew,
        handleRename,
        handleDelete,
        handleSoftDeleteBoard,
        handleSoftDeleteBoardWithInboxMove,
        handlePermanentDeleteBoard,
        handleRestoreBoard,
        handleEmptyTrash,
        handleCardTrashed,
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
        handleAddCardToInbox,
        recentlyTrashedShapeIds,
        handleCreateFolder,
        handleSetFolder,
        handleDeleteFolder,
    }
}
