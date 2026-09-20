// src/utils/calendarEvents.ts — 月曆格子上顯示什麼（純函式）
//
// 原本住在 `CalendarView.tsx`，因為要寫單元測試而從元件檔匯出，
// 會踩到 `react-refresh/only-export-components`（見 utils/searchIndex.ts 開頭的說明）。
import type { BoardRecord } from '../db'
import { toDateStr as dateStr } from './date'
import { getCardShapes } from './snapshot'

export interface DayTodo { text: string; checked: boolean }
export interface DayEvents { hasJournal: boolean; todos: DayTodo[]; boardActivity: number }

export function buildMonthEvents(boards: BoardRecord[], year: number, month: number): Map<string, DayEvents> {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
    const map = new Map<string, DayEvents>()
    const get = (ds: string): DayEvents => {
        if (!map.has(ds)) map.set(ds, { hasJournal: false, todos: [], boardActivity: 0 })
        return map.get(ds)!
    }
    for (const board of boards) {
        if (board.isHome || board.isInbox) continue
        // 白板活動：右側 agenda 一直有這一段，月曆格子卻看不出來，得一天天點才知道。
        // 注意 BoardRecord 只有一個 updatedAt，所以這反映的是「最後一次更新」落在哪天，
        // 不是「這天動過幾次」——與 buildAgenda 的 activeBoards 同一套語意。
        const boardDs = dateStr(new Date(board.updatedAt))
        if (boardDs.startsWith(prefix)) get(boardDs).boardActivity++
        for (const shape of getCardShapes(board.snapshot)) {
            if (board.isJournal && shape.props.type === 'journal' && shape.props.journalDate?.startsWith(prefix)) {
                get(shape.props.journalDate).hasJournal = true
            }
            if (shape.props.type === 'todo') {
                for (const t of shape.props.todos ?? []) {
                    if (t.dueDate?.startsWith(prefix)) {
                        get(t.dueDate).todos.push({ text: t.text ?? '', checked: !!t.checked })
                    }
                }
            }
        }
    }
    return map
}

/* ------------------------------------------------------------------ 當日議程 */
//
// 右側 agenda 與日檢視都吃它。原本住在 CalendarView.tsx，2026-09-20 月曆拆成
// 五種檢視時搬過來——元件檔只留元件，純資料邏輯放這裡才測得到。

export interface AgendaData {
    journalCard: { boardId: string; shapeId: string; text: string } | null
    todos: { boardId: string; boardName: string; shapeId: string; todoText: string; checked: boolean; x: number; y: number }[]
    activeBoards: { boardId: string; boardName: string }[]
}

export function buildAgenda(boards: BoardRecord[], date: Date): AgendaData {
    const ds = dateStr(date)
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0)
    const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999)
    let journalCard: AgendaData['journalCard'] = null
    const todos: AgendaData['todos'] = []
    const activeBoards: AgendaData['activeBoards'] = []
    for (const board of boards) {
        if (!board.isHome && !board.isInbox && board.updatedAt >= dayStart.getTime() && board.updatedAt <= dayEnd.getTime()) {
            activeBoards.push({ boardId: board.id, boardName: board.name })
        }
        for (const shape of getCardShapes(board.snapshot)) {
            if (board.isJournal && shape.props.type === 'journal' && shape.props.journalDate === ds && !journalCard) {
                journalCard = { boardId: board.id, shapeId: shape.id, text: shape.props.text ?? '' }
            }
            if (shape.props.type === 'todo') {
                for (const t of shape.props.todos ?? []) {
                    if (t.dueDate === ds) {
                        todos.push({ boardId: board.id, boardName: board.name, shapeId: shape.id, todoText: t.text ?? '', checked: !!t.checked, x: shape.x ?? 0, y: shape.y ?? 0 })
                    }
                }
            }
        }
    }
    return { journalCard, todos, activeBoards }
}
