import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { BoardRecord } from '../db'
import { saveBoard, generateId, uniqueName } from '../utils/boardDb'
import { toMutableSnapshot, toTLEditorSnapshot } from '../utils/snapshot'
import { ensurePageScaffold, nextAppendX, lastShapeIndex } from '../utils/snapshotCards'
import { stampCreated, stampUpdated } from '../utils/cardActivity'

/** useJournal 需共用的核心 board state（由 useBoardManager 傳入） */
export interface JournalSharedState {
    boards: BoardRecord[]
    setBoards: Dispatch<SetStateAction<BoardRecord[]>>
}

/**
 * Journal 領域：標記白板為 Journal、從 JournalDayView 寫入日記內容。
 * - handleSaveJournal：既有 shape 則就地更新 text；否則在白板 snapshot 末尾新建一張 journal 卡。
 */
export function useJournal(state: JournalSharedState) {
    const { boards, setBoards } = state

    const handleSetJournal = useCallback((boardId: string, isJournal: boolean) => {
        const board = boards.find(b => b.id === boardId)
        if (!board) return
        const updated = { ...board, isJournal }
        saveBoard(updated)
        setBoards(prev => prev.map(b => b.id === boardId ? updated : b))
    }, [boards, setBoards])

    /**
     * 一鍵建立日誌白板（v1.8.4 測試報告 P2-6）：新使用者打開日記／週回顧時，
     * 原本只看到「去側邊欄右鍵設定」的說明，卡在第一步。已經有日誌板就直接用那塊。
     */
    const handleCreateJournalBoard = useCallback((): BoardRecord => {
        const existing = boards.find(b => b.isJournal)
        if (existing) return existing
        const board: BoardRecord = {
            id: generateId(), name: uniqueName('📔 日誌', boards),
            snapshot: null, thumbnail: null, updatedAt: Date.now(), isJournal: true,
        }
        saveBoard(board)
        setBoards(prev => [...prev, board])
        return board
    }, [boards, setBoards])

    const handleSaveJournal = useCallback((boardId: string, dateStr: string, html: string, shapeId: string | null) => {
        if (!boardId) return
        const board = boards.find(b => b.id === boardId)
        if (!board) return

        const snap = toMutableSnapshot(board.snapshot)
        const store = snap.document.store

        if (shapeId && store[shapeId]) {
            const rec = store[shapeId]
            if (rec.props) { rec.props['text'] = html } else { rec.props = { text: html } }
            rec.meta = stampUpdated(rec.meta, Date.now())
        } else {
            const pageId = ensurePageScaffold(store)
            const newIndex = lastShapeIndex(store) + 'V'
            const newShapeId = `shape:jd_${dateStr.replace(/-/g, '')}_${Math.random().toString(36).slice(2, 7)}`
            const maxX = nextAppendX(store)
            store[newShapeId] = {
                typeName: 'shape', id: newShapeId, type: 'card',
                x: maxX, y: 100, rotation: 0, index: newIndex,
                parentId: pageId, isLocked: false, opacity: 1, meta: stampCreated({}, Date.now()),
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
    }, [boards, setBoards])

    return {
        handleSetJournal,
        handleSaveJournal,
        handleCreateJournalBoard,
    }
}
