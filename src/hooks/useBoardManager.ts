import { useState, useEffect, useCallback } from 'react'
import { db, trimBackups, type BoardRecord } from '../db'
import type { DeletedCardRecord } from '../db'
import { getISOWeekKey } from '../utils/weeklyReviewUtils'
import { loadAllBoards, saveBoard, deleteBoard, generateId, uniqueName } from '../utils/boardDb'
import { JUMP_DELAY_MS } from '../constants'
import { emitAppEvent } from '../utils/appEvents'
import {
    getSnapshotStore, withUpdatedStore, toMutableSnapshot, toTLEditorSnapshot,
} from '../utils/snapshot'
import { saveCardToTrash, getCardPreview } from '../utils/trashUtils'
import { cleanupOrphanBoardCards, sanitizeBoards } from '../utils/boardSanitize'
import { ensurePageScaffold, nextAppendX, lastShapeIndex } from '../utils/snapshotCards'
import { useAutoBackup } from './useAutoBackup'
import { useImageMigration } from './useImageMigration'
import { useSidebar } from './useSidebar'
import { useTrash } from './useTrash'
import { useNavigation } from './useNavigation'
import { useBoardCRUD } from './useBoardCRUD'
import { useFolder } from './useFolder'
import { useJournal } from './useJournal'
import { useInboxCards } from './useInboxCards'
import { useTags } from './useTags'

const TRASH_EXPIRE_MS = 14 * 86400000

export function useBoardManager() {
    const [boards, setBoards] = useState<BoardRecord[]>([])
    const [activeBoardId, setActiveBoardId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const { triggerAutoBackup } = useAutoBackup(boards)
    const { migrating: imageMigrating, migrateAllNow } = useImageMigration({ boards, setBoards, activeBoardId, enabled: !loading })
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
    const {
        handleCreateFolder, handleSetFolder, handleDeleteFolder,
    } = useFolder({ boards, setBoards })
    const { handleSetJournal, handleSaveJournal } = useJournal({ boards, setBoards })
    const {
        handleAddCardToInbox, handleMoveCardToBoard, handleMoveCardsToBoard,
        handleUpdateInboxCardProps,
    } = useInboxCards({ boards, setBoards })
    const { handleRewriteTag } = useTags({ boards, setBoards })

    useEffect(() => {
        navigator.storage?.persist?.().then(granted => {
            if (!granted) console.warn('[Storage] 持久化未授權，資料可能被清除')
        })
        loadAllBoards().then(async loaded => {
            // 啟動即清理超量自動備份（每份備份含全 vault base64 圖片，30 份會撐到數 GB）。
            // 只刪 key、不載 blob，記憶體成本低；放在 render 前先回收。
            try {
                const trimmed = await trimBackups()
                if (trimmed > 0) console.log(`[backup] 已清理 ${trimmed} 份超量備份`)
            } catch (err) { console.error('[backup] trimBackups 失敗', err) }

            // Auto-cleanup expired trash items
            const cutoff = Date.now() - TRASH_EXPIRE_MS
            const expiredBoards = loaded.filter(b => b.deletedAt && b.deletedAt < cutoff)
            for (const b of expiredBoards) await deleteBoard(b.id)
            try {
                const expiredCards: DeletedCardRecord[] = await db.table('deletedCards').where('deletedAt').below(cutoff).toArray()
                for (const c of expiredCards) {
                    if (c.type === 'file' || c.type === 'image') {
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

                    const pageId = ensurePageScaffold(st)
                    let lastIndex = lastShapeIndex(st)
                    let offsetX = nextAppendX(st)

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

    /**
     * 從收件匣把單張卡片丟進垃圾桶（Inbox Triage 用）。跨 inbox snapshot 與 deletedCards 兩個領域，
     * 故與其他跨領域 handler 一樣留在合成層。
     * 走與編輯器內刪卡相同的順序：先存檔進垃圾桶 → 再從 snapshot 與 editor 移除。
     */
    const handleTrashInboxCard = useCallback(async (shapeId: string) => {
        const inboxBoard = boards.find(b => b.isInbox)
        if (!inboxBoard?.snapshot) return
        const store = getSnapshotStore(inboxBoard.snapshot)
        const shape = store[shapeId]
        if (!shape) return

        // 先登記，Ctrl+Z 把 shape 加回 editor 時才會連帶撤銷這筆垃圾桶記錄
        recentlyTrashedShapeIds.current.add(shapeId)
        await saveCardToTrash(
            shapeId, structuredClone(shape), inboxBoard.id, inboxBoard.name,
            String(shape.props?.type ?? 'text'), getCardPreview(shape),
        )

        const newStore = { ...store }
        delete newStore[shapeId]
        const updated: BoardRecord = {
            ...inboxBoard,
            snapshot: withUpdatedStore(inboxBoard.snapshot, newStore),
            updatedAt: Date.now(),
        }
        await saveBoard(updated)
        setBoards(prev => prev.map(b => b.id === inboxBoard.id ? updated : b))

        emitAppEvent('delete-shape-from-editor', { shapeId })
        await refreshTrashCount()
    }, [boards, recentlyTrashedShapeIds, refreshTrashCount])

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
        handleMoveCardsToBoard,
        handleToggleCollapse,
        handleGoToInbox,
        handleReorderBoards,
        handleAddCardToInbox,
        handleUpdateInboxCardProps,
        handleTrashInboxCard,
        recentlyTrashedShapeIds,
        handleCreateFolder,
        handleSetFolder,
        handleDeleteFolder,
        handleRewriteTag,
        imageMigrating,
        migrateAllNow,
    }
}
