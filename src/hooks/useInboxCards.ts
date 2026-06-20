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
 * - handleMoveCardsToBoard：從 inbox 移除一或多張 shape、依序附加至目標白板末尾（水平排開
 *   避免重疊），逐張發 delete-shape-from-editor 事件。
 * - handleMoveCardToBoard：單卡版，委派給 handleMoveCardsToBoard（保留既有 API）。
 */
export function useInboxCards(state: InboxCardsSharedState) {
    const { boards, setBoards } = state

    const handleMoveCardsToBoard = useCallback((shapeIds: string[], targetBoardId: string) => {
        const inboxBoard = boards.find(b => b.isInbox)
        if (!inboxBoard?.snapshot) return
        const srcStore = getSnapshotStore(inboxBoard.snapshot)

        // 只搬仍存在於 inbox 的 shape
        const moving = shapeIds.flatMap(id => {
            const shape = srcStore[id]
            return shape ? [{ id, shape }] : []
        })
        if (moving.length === 0) return

        // Compute updated inbox (shapes removed)
        const newInboxStore = { ...srcStore }
        for (const { id } of moving) delete newInboxStore[id]
        const updatedInbox: BoardRecord = {
            ...inboxBoard,
            snapshot: withUpdatedStore(inboxBoard.snapshot, newInboxStore),
            updatedAt: Date.now(),
        }
        saveBoard(updatedInbox)

        // Compute updated target (shapes appended, laid out horizontally)
        const targetBoard = boards.find(b => b.id === targetBoardId)
        let updatedTarget: BoardRecord | null = null
        if (targetBoard) {
            const snap = toMutableSnapshot(targetBoard.snapshot)
            const st = snap.document.store
            const pageId = ensurePageScaffold(st)
            let x = nextAppendX(st)
            for (const { id, shape } of moving) {
                st[id] = { ...structuredClone(shape), parentId: pageId, x, y: 100 }
                const w = (shape as { props?: { w?: number } }).props?.w ?? 240
                x += w + 40
            }
            updatedTarget = { ...targetBoard, snapshot: toTLEditorSnapshot(snap), updatedAt: Date.now() }
            saveBoard(updatedTarget)
        }

        setBoards(prev => prev.map(b => {
            if (b.id === inboxBoard.id) return updatedInbox
            if (updatedTarget && b.id === targetBoardId) return updatedTarget
            return b
        }))

        for (const { id } of moving) emitAppEvent('delete-shape-from-editor', { shapeId: id })
    }, [boards, setBoards])

    const handleMoveCardToBoard = useCallback(
        (shapeId: string, targetBoardId: string) => handleMoveCardsToBoard([shapeId], targetBoardId),
        [handleMoveCardsToBoard],
    )

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
        handleMoveCardsToBoard,
    }
}
