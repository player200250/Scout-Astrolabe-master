// src/utils/mcpTools.ts
//
// Claude Code（MCP）與主視窗之間的契約，以及讀取工具的計算。見 docs/adr/0010-claude-code-mcp-bridge.md。
//
// 邊界同 Scout Desktop：主視窗是唯一的寫入者。main process 只驗 token、檢查工具名稱與大小、轉送；
// 參數的完整檢查在這裡（parseMcpArgs），寫入交給主視窗既有的 handler。
//
// 本檔是純函式（不碰 React、Dexie、tldraw 執行期），才能直接在 vitest 裡測。

import type { BoardRecord } from '../db'
import { getCardShapes } from './snapshot'
import { buildCardSearchText, buildSearchIndex, searchFromIndex } from './searchIndex'
import type { SnapshotTodo } from './snapshot'
import { isOverdue, isOpenDueToday } from './dueStatus'

export const MCP_TOOL_NAMES = [
    'list_boards', 'read_board', 'search_cards', 'list_todos',
    'add_to_inbox', 'set_todo_checked', 'set_todo_due',
] as const
export type McpToolName = typeof MCP_TOOL_NAMES[number]

/** main → 主視窗的請求；id 由 main 產生，回應要帶回同一個 id */
export interface McpRequest {
    id: string
    tool: string
    args: unknown
}

export type McpResult = { ok: true; data: unknown } | { ok: false; error: string }

/** 新增卡片文字長度上限（同 Scout Desktop 的快速筆記） */
export const MCP_TEXT_MAX = 5000
export const MCP_QUERY_MAX = 200
/** read_board 每張卡的文字上限：整塊板一次回給 Claude，太長會吃光對話空間 */
export const MCP_CARD_TEXT_MAX = 2000
export const MCP_TODO_LIMIT = 200

export type TodoFilter = 'overdue' | 'today' | 'open' | 'all'

export type McpArgs =
    | { tool: 'list_boards' }
    | { tool: 'read_board'; boardId: string }
    | { tool: 'search_cards'; query: string }
    | { tool: 'list_todos'; filter: TodoFilter }
    | { tool: 'add_to_inbox'; text: string }
    | { tool: 'set_todo_checked'; boardId: string; cardId: string; todoId: string; checked: boolean }
    | { tool: 'set_todo_due'; boardId: string; cardId: string; todoId: string; dueDate: string | null }

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function str(v: unknown, max = 200): string | null {
    if (typeof v !== 'string') return null
    const s = v.trim()
    return s && s.length <= max ? s : null
}

/** 檢查工具名稱與參數；不合格回錯誤訊息字串（會原樣顯示給 Claude） */
export function parseMcpArgs(tool: string, raw: unknown): McpArgs | string {
    const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    switch (tool) {
        case 'list_boards':
            return { tool }
        case 'read_board': {
            const boardId = str(a.boardId)
            return boardId ? { tool, boardId } : '缺少 boardId'
        }
        case 'search_cards': {
            const query = str(a.query, MCP_QUERY_MAX)
            return query ? { tool, query } : `query 要是 1–${MCP_QUERY_MAX} 字`
        }
        case 'list_todos': {
            const filter = a.filter ?? 'open'
            return filter === 'overdue' || filter === 'today' || filter === 'open' || filter === 'all'
                ? { tool, filter }
                : 'filter 只能是 overdue／today／open／all'
        }
        case 'add_to_inbox': {
            const text = str(a.text, MCP_TEXT_MAX)
            return text ? { tool, text } : `text 要是 1–${MCP_TEXT_MAX} 字`
        }
        case 'set_todo_checked':
        case 'set_todo_due': {
            const boardId = str(a.boardId), cardId = str(a.cardId), todoId = str(a.todoId)
            if (!boardId || !cardId || !todoId) return '缺少 boardId／cardId／todoId'
            if (tool === 'set_todo_checked') {
                return typeof a.checked === 'boolean' ? { tool, boardId, cardId, todoId, checked: a.checked } : 'checked 要是 true 或 false'
            }
            const dueDate = a.dueDate ?? null
            if (dueDate !== null && !(typeof dueDate === 'string' && DATE_PATTERN.test(dueDate))) return 'dueDate 要是 YYYY-MM-DD 或 null'
            return { tool, boardId, cardId, todoId, dueDate }
        }
        default:
            return `沒有這個工具：${tool}`
    }
}

function clip(s: string, max: number): string {
    return s.length <= max ? s : `${s.slice(0, max)}…（後面省略）`
}

function boardKind(b: BoardRecord): string {
    if (b.isInbox) return 'inbox'
    if (b.isJournal) return 'journal'
    if (b.isHome) return 'home'
    if (b.isFolder) return 'folder'
    return 'board'
}

const live = (boards: BoardRecord[]) => boards.filter(b => !b.deletedAt)

export function listBoards(boards: BoardRecord[]) {
    const all = live(boards)
    const folderName = new Map(all.filter(b => b.isFolder).map(b => [b.id, b.name]))
    return all.map(b => ({
        id: b.id,
        name: b.name,
        kind: boardKind(b),
        folder: b.folderId ? folderName.get(b.folderId) ?? null : null,
        cardCount: b.isFolder ? 0 : getCardShapes(b.snapshot).length,
        updatedAt: new Date(b.updatedAt).toISOString(),
    }))
}

function todosOf(todos: SnapshotTodo[] = []) {
    return todos.map(t => ({ todoId: t.id, text: t.text, checked: !!t.checked, dueDate: t.dueDate ?? null }))
}

export function readBoard(boards: BoardRecord[], boardId: string): McpResult {
    const all = live(boards)
    const board = all.find(b => b.id === boardId)
    if (!board) return { ok: false, error: `找不到白板 ${boardId}（可能在垃圾桶）` }
    const names = new Map(all.map(b => [b.id, b.name]))
    const cards = getCardShapes(board.snapshot).map(shape => {
        const props = shape.props
        const { preview } = buildCardSearchText(props, names)
        return {
            cardId: shape.id,
            type: props.type ?? 'text',
            text: clip(preview, MCP_CARD_TEXT_MAX),
            tags: Array.isArray(props.tags) ? props.tags : [],
            ...(props.type === 'todo' ? { todos: todosOf(props.todos) } : {}),
        }
    })
    return { ok: true, data: { boardId: board.id, name: board.name, kind: boardKind(board), cards } }
}

export function searchCards(boards: BoardRecord[], query: string) {
    const { results, total } = searchFromIndex(buildSearchIndex(live(boards)), query)
    return {
        total,
        results: results.map(r => ({ boardId: r.boardId, boardName: r.boardName, cardId: r.shapeId, type: r.type, text: clip(r.preview, 200) })),
    }
}

export function listTodos(boards: BoardRecord[], filter: TodoFilter, today: string) {
    const items = []
    for (const board of live(boards)) {
        for (const shape of getCardShapes(board.snapshot)) {
            if (shape.props.type !== 'todo') continue
            for (const t of shape.props.todos ?? []) {
                const due = t.dueDate ?? null
                const overdue = isOverdue(t, today)
                const keep = filter === 'all'
                    || (filter === 'open' && !t.checked)
                    || (filter === 'overdue' && overdue)
                    || (filter === 'today' && isOpenDueToday(t, today))
                if (!keep) continue
                items.push({ boardId: board.id, boardName: board.name, cardId: shape.id, todoId: t.id, text: t.text, checked: !!t.checked, dueDate: due, isOverdue: overdue })
            }
        }
    }
    // 有到期日的在前、依日期；沒到期日的排最後
    items.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    return { total: items.length, items: items.slice(0, MCP_TODO_LIMIT) }
}
