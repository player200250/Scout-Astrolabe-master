import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { BoardRecord } from '../db'
import { saveBoard, deleteBoard, generateId } from '../utils/boardDb'
import { uniqueName } from '../utils/boardDb'

/** useFolder 需共用的核心 board state（由 useBoardManager 傳入） */
export interface FolderSharedState {
    boards: BoardRecord[]
    setBoards: Dispatch<SetStateAction<BoardRecord[]>>
}

/**
 * 資料夾領域：建立資料夾、設定白板所屬資料夾、刪除資料夾（其下白板移出至無資料夾）。
 * 皆為 BoardRecord 層級操作，無 snapshot store 操作。
 */
export function useFolder(state: FolderSharedState) {
    const { boards, setBoards } = state

    const handleCreateFolder = useCallback((name: string): BoardRecord => {
        const folderName = uniqueName(name, boards)
        const folder: BoardRecord = { id: generateId(), name: folderName, snapshot: null, thumbnail: null, updatedAt: Date.now(), isFolder: true }
        saveBoard(folder)
        setBoards(prev => [...prev, folder])
        return folder
    }, [boards, setBoards])

    const handleSetFolder = useCallback((boardId: string, folderId: string | null) => {
        const board = boards.find(b => b.id === boardId)
        if (!board) return
        const updated = { ...board, folderId: folderId ?? null }
        saveBoard(updated)
        setBoards(prev => prev.map(b => b.id === boardId ? updated : b))
    }, [boards, setBoards])

    const handleDeleteFolder = useCallback((folderId: string) => {
        const toMove = boards.filter(b => b.folderId === folderId)
        toMove.forEach(b => saveBoard({ ...b, folderId: null }))
        deleteBoard(folderId)
        setBoards(prev => prev
            .filter(b => b.id !== folderId)
            .map(b => b.folderId === folderId ? { ...b, folderId: null } : b)
        )
    }, [boards, setBoards])

    return {
        handleCreateFolder,
        handleSetFolder,
        handleDeleteFolder,
    }
}
