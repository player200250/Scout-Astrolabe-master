import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { BoardRecord } from '../db'
import { saveBoard } from '../utils/boardDb'
import { getSnapshotStore } from '../utils/snapshot'
import { toggleTodo, setTodoDue, addTodoFocus, setTodoSchedule } from '../utils/snapshotPatch'
import { emitAppEvent } from '../utils/appEvents'

/** useTodoEdits 需共用的核心 board state（由 useBoardManager 傳入） */
export interface TodoEditsSharedState {
    boards: BoardRecord[]
    setBoards: Dispatch<SetStateAction<BoardRecord[]>>
}

/** addFocus：番茄鐘綁這項的專注跑完了，番茄數 +1 */
export type TodoChange =
    | { checked: boolean }
    | { dueDate: string | null }
    | { addFocus: true }
    /** 排進行事曆（null＝取消） */
    | { schedule: { start: string; end: string } | null }

/**
 * 在編輯器外改任一白板上的一個待辦項目（Claude Code 的 MCP 工具、番茄鐘綁任務共用，見 ADR 0010）。
 * - 改 snapshot 走 snapshotPatch（與手機端同一份實作），會補 checkedAt 與卡片 meta.updatedAt。
 * - 同 useTags：存檔後發 update-shape-props-in-editor，該板若正開著，editor 跟上新 todos——
 *   否則它的自動存檔會用舊 props 蓋回去；也因此開著的板可以 Ctrl+Z 復原。
 * 回傳是否真的找到並改了（白板在垃圾桶、卡或項目不存在都回 false）。
 */
export function useTodoEdits(state: TodoEditsSharedState) {
    const { boards, setBoards } = state

    const handleEditTodo = useCallback((boardId: string, shapeId: string, todoId: string, change: TodoChange): boolean => {
        const board = boards.find(b => b.id === boardId && !b.deletedAt)
        if (!board?.snapshot) return false
        const snapshot = 'checked' in change
            ? toggleTodo(board.snapshot, shapeId, todoId, change.checked)
            : 'addFocus' in change
                ? addTodoFocus(board.snapshot, shapeId, todoId)
                : 'schedule' in change
                    ? setTodoSchedule(board.snapshot, shapeId, todoId, change.schedule)
                    : setTodoDue(board.snapshot, shapeId, todoId, change.dueDate)
        if (snapshot === board.snapshot) return false

        const updated: BoardRecord = { ...board, snapshot, updatedAt: Date.now() }
        saveBoard(updated)
        setBoards(prev => prev.map(b => b.id === boardId ? updated : b))

        const todos = getSnapshotStore(snapshot)[shapeId]?.props?.todos
        emitAppEvent('update-shape-props-in-editor', { shapeId, props: { todos } })
        return true
    }, [boards, setBoards])

    return { handleEditTodo }
}
