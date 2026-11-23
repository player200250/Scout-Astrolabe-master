// src/utils/taskCenterBoard.ts — 任務中心看板的分欄與過濾（純函式，方便測試）
import type { TaskItem } from './todoScan'

export type GroupKey = 'overdue' | 'today' | 'week' | 'later' | 'noduedate'

export const GROUP_ORDER: GroupKey[] = ['overdue', 'today', 'week', 'later', 'noduedate']

export function getGroupKey(dueDate: string | undefined, todayStr: string, weekStr: string): GroupKey {
    if (!dueDate) return 'noduedate'
    if (dueDate < todayStr) return 'overdue'
    if (dueDate === todayStr) return 'today'
    if (dueDate <= weekStr) return 'week'
    return 'later'
}

/** 搜尋比對待辦文字與白板名稱（不分大小寫，前後空白忽略）。 */
export function matchesQuery(item: TaskItem, query: string): boolean {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return item.todoText.toLowerCase().includes(q) || item.boardName.toLowerCase().includes(q)
}

/** 依搜尋與「顯示已完成」過濾後分進五欄；欄內順序沿用 scanBoards 的排序。 */
export function groupTasks(
    items: TaskItem[], query: string, showDone: boolean, todayStr: string, weekStr: string,
): Record<GroupKey, TaskItem[]> {
    const out: Record<GroupKey, TaskItem[]> = { overdue: [], today: [], week: [], later: [], noduedate: [] }
    for (const item of items) {
        if (!showDone && item.checked) continue
        if (!matchesQuery(item, query)) continue
        out[getGroupKey(item.dueDate || undefined, todayStr, weekStr)].push(item)
    }
    return out
}
