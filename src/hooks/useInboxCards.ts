import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { BoardRecord } from '../db'
import { saveBoard } from '../utils/boardDb'
import { getSnapshotStore, withUpdatedStore, toMutableSnapshot, toTLEditorSnapshot } from '../utils/snapshot'
import { ensurePageScaffold, nextAppendX, lastShapeIndex } from '../utils/snapshotCards'
import { emitAppEvent } from '../utils/appEvents'

/** useInboxCards 需共用的核心 board state（由 useBoardManager 傳入） */
export interface InboxCardsSharedState {
    boards: BoardRecord[]
    setBoards: Dispatch<SetStateAction<BoardRecord[]>>
}

/**
 * 收件匣卡片領域：快速建立文字卡至收件匣、把收件匣卡片移動到目標白板。
 * - handleAddCardToInbox：更新 inbox snapshot（供非 inbox 板算 inboxCardCount）＋ 發 quick-capture-card
 *   事件（供 inbox 板 editor 即時顯示）。
 * - handleMoveCardToBoard：從 inbox 移除 shape、插入目標白板末尾，發 delete-shape-from-editor 事件。
 */
export function useInboxCards(state: InboxCardsSharedState) {
    const { boards, setBoards } = state

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
            const pageId = ensurePageScaffold(st)
            const maxX = nextAppendX(st)
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
    }, [boards, setBoards])

    const handleAddCardToInbox = useCallback((text: string) => {
        const inboxBoard = boards.find(b => b.isInbox)
        if (!inboxBoard) return

        const snap = toMutableSnapshot(inboxBoard.snapshot)
        const store = snap.document.store

        const pageId = ensurePageScaffold(store)
        const newIndex = lastShapeIndex(store) + 'V'
        const maxX = nextAppendX(store)

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
    }, [boards, setBoards])

    return {
        handleAddCardToInbox,
        handleMoveCardToBoard,
    }
}
