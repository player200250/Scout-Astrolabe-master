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

/** 'YYYY-MM-DD' 加 n 天（用本地日期算，避開時區把日期推前一天）。 */
function addDays(dateStr: string, n: number): string {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(y, m - 1, d + n)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/**
 * 卡片拖到某欄後要設的到期日。
 * - undefined＝這欄不能放（已逾期：拖過去沒有合理的日期）
 * - null＝清掉到期日（無截止日）
 * 「本週」是今天起 7 天內（見 getGroupKey），所以放明天；「之後」放第 8 天＝該欄最早的一天。
 */
export function dropTargetDate(key: GroupKey, todayStr: string, weekStr: string): string | null | undefined {
    switch (key) {
        case 'overdue': return undefined
        case 'today': return todayStr
        case 'week': return addDays(todayStr, 1)
        case 'later': return addDays(weekStr, 1)
        case 'noduedate': return null
    }
}
