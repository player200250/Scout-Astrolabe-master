// @vitest-environment jsdom
// src/utils/mcpTools.test.ts — Claude Code（MCP）讀取工具與參數檢查
import { describe, it, expect } from 'vitest'
import type { TLEditorSnapshot } from 'tldraw'
import type { BoardRecord } from '../db'
import { parseMcpArgs, listBoards, readBoard, searchCards, listTodos, MCP_TOOL_NAMES } from './mcpTools'
import { MCP_READ_TOOLS, MCP_WRITE_TOOLS } from '../../mcpRules.js'

function snap(shapes: Record<string, Record<string, unknown>>): TLEditorSnapshot {
    const store: Record<string, unknown> = {}
    for (const [id, props] of Object.entries(shapes)) {
        store[id] = { typeName: 'shape', id, type: 'card', x: 0, y: 0, props }
    }
    return { document: { store, schema: {} }, session: {} } as unknown as TLEditorSnapshot
}

function board(id: string, name: string, shapes: Record<string, Record<string, unknown>> = {}, extra: Partial<BoardRecord> = {}): BoardRecord {
    return { id, name, snapshot: snap(shapes), thumbnail: null, updatedAt: 0, ...extra }
}

const boards: BoardRecord[] = [
    board('inbox', '收件匣', { 'shape:n': { type: 'text', text: '<p>記一筆</p>' } }, { isInbox: true }),
    board('f1', '求職', {}, { isFolder: true }),
    board('b1', '作品集', {
        'shape:t': {
            type: 'todo', text: '', todos: [
                { id: 'a', text: '畫線稿', checked: false, dueDate: '2026-11-01' },
                { id: 'b', text: '上色', checked: false, dueDate: '2026-11-07' },
                { id: 'c', text: '寄履歷', checked: true, dueDate: '2026-10-30' },
                { id: 'd', text: '沒日期', checked: false },
            ],
        },
        'shape:x': { type: 'text', text: '<p>Spine 綁骨筆記</p>', tags: ['spine'] },
    }, { folderId: 'f1' }),
    board('old', '舊板', { 'shape:z': { type: 'text', text: '<p>Spine 舊筆記</p>' } }, { deletedAt: 1 }),
]

describe('工具白名單兩端一致', () => {
    it('主視窗與 main process 的清單相同', () => {
        expect([...MCP_TOOL_NAMES].sort()).toEqual([...MCP_READ_TOOLS, ...MCP_WRITE_TOOLS].sort())
    })
})

describe('parseMcpArgs', () => {
    it('合格參數', () => {
        expect(parseMcpArgs('read_board', { boardId: 'b1' })).toEqual({ tool: 'read_board', boardId: 'b1' })
        expect(parseMcpArgs('list_todos', {})).toEqual({ tool: 'list_todos', filter: 'open' })
        expect(parseMcpArgs('set_todo_due', { boardId: 'b1', cardId: 'shape:t', todoId: 'a', dueDate: null }))
            .toEqual({ tool: 'set_todo_due', boardId: 'b1', cardId: 'shape:t', todoId: 'a', dueDate: null })
    })

    it('不合格回錯誤字串', () => {
        expect(typeof parseMcpArgs('read_board', {})).toBe('string')
        expect(typeof parseMcpArgs('add_to_inbox', { text: '   ' })).toBe('string')
        expect(typeof parseMcpArgs('add_to_inbox', { text: 'x'.repeat(5001) })).toBe('string')
        expect(typeof parseMcpArgs('set_todo_checked', { boardId: 'b1', cardId: 'shape:t', todoId: 'a', checked: 'yes' })).toBe('string')
        expect(typeof parseMcpArgs('set_todo_due', { boardId: 'b1', cardId: 'shape:t', todoId: 'a', dueDate: '11/7' })).toBe('string')
        expect(typeof parseMcpArgs('list_todos', { filter: 'later' })).toBe('string')
        expect(typeof parseMcpArgs('delete_board', {})).toBe('string')
    })
})

describe('listBoards', () => {
    it('不含垃圾桶，標出種類與資料夾', () => {
        const list = listBoards(boards)
        expect(list.map(b => b.id)).toEqual(['inbox', 'f1', 'b1'])
        expect(list.find(b => b.id === 'b1')).toMatchObject({ kind: 'board', folder: '求職', cardCount: 2 })
        expect(list.find(b => b.id === 'inbox')?.kind).toBe('inbox')
    })
})

describe('readBoard', () => {
    it('卡片轉純文字，待辦附 todoId', () => {
        const r = readBoard(boards, 'b1')
        expect(r.ok).toBe(true)
        const cards = (r as { data: { cards: { cardId: string; text: string; todos?: { todoId: string }[] }[] } }).data.cards
        expect(cards.find(c => c.cardId === 'shape:x')?.text).toBe('Spine 綁骨筆記')
        expect(cards.find(c => c.cardId === 'shape:t')?.todos?.map(t => t.todoId)).toEqual(['a', 'b', 'c', 'd'])
    })

    it('垃圾桶裡的板讀不到', () => {
        expect(readBoard(boards, 'old').ok).toBe(false)
    })
})

describe('searchCards', () => {
    it('搜得到內容與標籤，不含垃圾桶', () => {
        const r = searchCards(boards, 'spine')
        expect(r.results.map(x => x.cardId)).toEqual(['shape:x'])
    })
})

describe('listTodos', () => {
    const today = '2026-11-07'
    const ids = (f: Parameters<typeof listTodos>[1]) => listTodos(boards, f, today).items.map(t => t.todoId)

    it('四種篩選', () => {
        expect(ids('overdue')).toEqual(['a'])
        expect(ids('today')).toEqual(['b'])
        expect(ids('open')).toEqual(['a', 'b', 'd'])
        expect(ids('all')).toEqual(['c', 'a', 'b', 'd'])
    })

    it('帶回寫入需要的 id', () => {
        expect(listTodos(boards, 'overdue', today).items[0]).toMatchObject({ boardId: 'b1', cardId: 'shape:t', todoId: 'a', isOverdue: true })
    })
})
