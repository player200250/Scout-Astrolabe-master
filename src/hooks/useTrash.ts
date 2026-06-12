import { useState, useEffect, useRef, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { db, type BoardRecord } from '../db'
import { deleteBoard, saveBoard } from '../utils/boardDb'
import { cleanupOrphanBoardCards } from '../utils/boardSanitize'
import { onAppEvent } from '../utils/appEvents'

/** useTrash 需共用的核心 board state（由 useBoardManager 傳入） */
export interface TrashSharedState {
    boards: BoardRecord[]
    setBoards: Dispatch<SetStateAction<BoardRecord[]>>
    activeBoardId: string | null
    setActiveBoardId: Dispatch<SetStateAction<string | null>>
}

/**
 * 垃圾桶領域：軟刪除/還原/清空、垃圾數量統計。
 * - refreshTrashCount 也供合成層的跨領域 handler（永久刪除、搬至 Inbox 後刪除）與 init 載入呼叫，故回傳。
 * - handlePermanentDeleteBoard / handleSoftDeleteBoardWithInboxMove 因跨領域，仍留在 useBoardManager。
 */
export function useTrash(state: TrashSharedState) {
    const { boards, setBoards, activeBoardId, setActiveBoardId } = state
    const [trashCount, setTrashCount] = useState(0)
    const recentlyTrashedShapeIds = useRef<Set<string>>(new Set())

    const refreshTrashCount = useCallback(async () => {
        const deletedBoardCount = await db.table('boards').where('deletedAt').above(0).count()
        const deletedCardCount = await db.table('deletedCards').count()
        setTrashCount(deletedBoardCount + deletedCardCount)
    }, [])

    const handleSoftDeleteBoard = useCallback(async (id: string) => {
        const board = boards.find(b => b.id === id)
        if (!board) return
        const updated = { ...board, deletedAt: Date.now() }
        await saveBoard(updated)
        const next = boards.filter(b => b.id !== id)
        if (activeBoardId === id) setActiveBoardId(next[0]?.id ?? null)
        setBoards(next)
        await refreshTrashCount()
    }, [activeBoardId, boards, refreshTrashCount, setBoards, setActiveBoardId])

    const handleDelete = useCallback((id: string) => {
        handleSoftDeleteBoard(id)
    }, [handleSoftDeleteBoard])

    const handleRestoreBoard = useCallback(async (id: string) => {
        const record: BoardRecord | undefined = await db.table('boards').get(id)
        if (!record) return
        const restored = { ...record, deletedAt: undefined }
        // Dexie doesn't remove the field on put; explicitly delete via update
        const updated = await db.table('boards').update(id, { deletedAt: undefined })
        if (updated === 0) {
            alert('還原失敗，請重試。')
            return
        }
        setBoards(prev => [...prev, restored])
        refreshTrashCount()
    }, [refreshTrashCount, setBoards])

    const handleEmptyTrash = useCallback(async () => {
        const deletedBoards: BoardRecord[] = await db.table('boards').where('deletedAt').above(0).toArray()
        for (const b of deletedBoards) {
            await deleteBoard(b.id)
            // Also clean up orphan board-card references
            boards.forEach(active => {
                if (!active.snapshot) return
                const newSnap = cleanupOrphanBoardCards(active.snapshot, b.id)
                if (newSnap !== active.snapshot) saveBoard({ ...active, snapshot: newSnap })
            })
        }
        await db.table('deletedCards').clear()
        setTrashCount(0)
    }, [boards])

    const handleCardTrashed = useCallback(() => {
        refreshTrashCount()
    }, [refreshTrashCount])

    useEffect(() => {
        return onAppEvent('trash-count-changed', () => { refreshTrashCount() })
    }, [refreshTrashCount])

    return {
        trashCount,
        recentlyTrashedShapeIds,
        refreshTrashCount,
        handleSoftDeleteBoard,
        handleDelete,
        handleRestoreBoard,
        handleEmptyTrash,
        handleCardTrashed,
    }
}
