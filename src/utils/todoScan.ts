// src/utils/todoScan.ts — 把所有白板上的待辦項目攤平成一張清單
//
// 任務中心與番茄鐘的「綁哪個待辦」都要這份清單，所以從 TaskCenter.tsx 抽出來共用。
import type { BoardRecord } from '../db'
import { getCardShapes } from './snapshot'

export interface TaskItem {
    boardId: string
    boardName: string
    shapeId: string
    cardTitle: string
    todoId: string
    todoText: string
    dueDate: string
    checked: boolean
    /** 綁這項跑完的番茄數 */
    focusCount: number
    x: number
    y: number
}

export function scanBoards(boards: BoardRecord[]): TaskItem[] {
    const items: TaskItem[] = []
    const seen = new Set<string>()
    for (const board of boards) {
        for (const shape of getCardShapes(board.snapshot)) {
            if (shape.props.type !== 'todo') continue
            for (const t of shape.props.todos ?? []) {
                if (!t.text) continue
                const dedupKey = `${board.id}-${t.id}`
                if (seen.has(dedupKey)) continue
                seen.add(dedupKey)
                items.push({
                    boardId: board.id, boardName: board.name, shapeId: shape.id,
                    cardTitle: shape.props.text || '', todoId: t.id, todoText: t.text,
                    dueDate: t.dueDate ?? '', checked: !!t.checked,
                    focusCount: typeof t.focusCount === 'number' ? t.focusCount : 0,
                    x: shape.x ?? 0, y: shape.y ?? 0,
                })
            }
        }
    }
    return items
}
