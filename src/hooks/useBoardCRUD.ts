import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { TLEditorSnapshot } from 'tldraw'
import type { BoardRecord } from '../db'
import { saveBoard, generateId } from '../utils/boardDb'

/** 在現有白板名稱中產生不重複名稱（base、base (2)、base (3)…）。純函式。 */
export function uniqueName(base: string, currentBoards: BoardRecord[]): string {
    const existing = new Set(currentBoards.map(b => b.name))
    if (!existing.has(base)) return base
    let n = 2
    while (existing.has(`${base} (${n})`)) n++
    return `${base} (${n})`
}

/** useBoardCRUD 需共用的核心 board state（由 useBoardManager 傳入） */
export interface BoardCRUDSharedState {
    boards: BoardRecord[]
    setBoards: Dispatch<SetStateAction<BoardRecord[]>>
    activeBoardId: string | null
}

/**
 * 白板 metadata CRUD：存檔、建立、改名、設定狀態、排序。
 * 皆為 BoardRecord 層級操作（無 tldraw snapshot store 操作、無導航/垃圾桶副作用）。
 * 跨領域的建立白板（handleNew，含導航）仍留在 useBoardManager，共用匯出的 uniqueName。
 */
export function useBoardCRUD(state: BoardCRUDSharedState) {
    const { boards, setBoards, activeBoardId } = state

    // thumbnail 傳 undefined＝保留現有縮圖（用於高頻存檔時不重產昂貴的整板 PNG）；
    // 傳 string/null＝明確覆蓋。
    const handleSaveBoard = useCallback((snapshot: TLEditorSnapshot, thumbnail?: string | null) => {
        if (!activeBoardId) return
        const board = boards.find(b => b.id === activeBoardId)
        if (!board) return
        const nextThumbnail = thumbnail === undefined ? board.thumbnail : thumbnail
        const updated = { ...board, snapshot, thumbnail: nextThumbnail, updatedAt: Date.now() }
        saveBoard(updated).catch(err => console.error('[handleSaveBoard] DB 寫入失敗', err))
        setBoards(prev => prev.map(b => b.id === activeBoardId ? updated : b))
    }, [activeBoardId, boards, setBoards])

    const handleCreateBoard = useCallback((name: string, parentId?: string): BoardRecord => {
        const safeName = uniqueName(name, boards)
        const newBoard: BoardRecord = { id: generateId(), name: safeName, snapshot: null, thumbnail: null, updatedAt: Date.now(), parentId: parentId ?? null }
        saveBoard(newBoard)
        setBoards(prev => [...prev, newBoard])
        return newBoard
    }, [boards, setBoards])

    const handleRename = useCallback((id: string, name: string) => {
        const board = boards.find(b => b.id === id)
        if (!board) return
        const updated = { ...board, name }
        saveBoard(updated)
        setBoards(prev => prev.map(b => b.id === id ? updated : b))
    }, [boards, setBoards])

    const handleSetStatus = useCallback((boardId: string, status: 'active' | 'archived' | 'pinned') => {
        const board = boards.find(b => b.id === boardId)
        if (!board) return
        const updated = { ...board, status }
        saveBoard(updated)
        setBoards(prev => prev.map(b => b.id === boardId ? updated : b))
    }, [boards, setBoards])

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
    }, [boards, setBoards])

    return {
        handleSaveBoard,
        handleCreateBoard,
        handleRename,
        handleSetStatus,
        handleReorderBoards,
    }
}
