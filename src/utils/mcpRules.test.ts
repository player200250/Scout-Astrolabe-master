// src/utils/mcpRules.test.ts — Claude Code 本機接口的門口檢查（根目錄 mcpRules.js）
import { describe, it, expect } from 'vitest'
import { checkMcpRequest, parseMcpCall, mcpLogEntry } from '../../mcpRules.js'

const ep = { port: 50123, token: 'a'.repeat(64) }
const ok = {
    method: 'POST',
    url: '/call',
    headers: { host: '127.0.0.1:50123', authorization: `Bearer ${'a'.repeat(64)}` } as Record<string, string>,
}

describe('checkMcpRequest', () => {
    it('本機程式帶對的 token＝放行', () => {
        expect(checkMcpRequest(ok, ep)).toBeNull()
    })

    it('token 錯、沒帶、長度不同都擋', () => {
        expect(checkMcpRequest({ ...ok, headers: { ...ok.headers, authorization: `Bearer ${'b'.repeat(64)}` } }, ep)?.[0]).toBe(401)
        expect(checkMcpRequest({ ...ok, headers: { host: ok.headers.host } }, ep)?.[0]).toBe(401)
        expect(checkMcpRequest({ ...ok, headers: { ...ok.headers, authorization: 'Bearer short' } }, ep)?.[0]).toBe(401)
    })

    // 網頁不該碰得到白板：瀏覽器發的請求一定帶 Origin
    it('帶 Origin（瀏覽器發的）一律擋，即使 token 對', () => {
        expect(checkMcpRequest({ ...ok, headers: { ...ok.headers, origin: 'https://evil.example' } }, ep)?.[0]).toBe(403)
    })

    it('Host 不是 127.0.0.1:port 就擋（DNS rebinding）', () => {
        expect(checkMcpRequest({ ...ok, headers: { ...ok.headers, host: 'evil.example:50123' } }, ep)?.[0]).toBe(403)
        expect(checkMcpRequest({ ...ok, headers: { ...ok.headers, host: 'localhost:50123' } }, ep)?.[0]).toBe(403)
    })

    it('只有 POST /call', () => {
        expect(checkMcpRequest({ ...ok, method: 'GET' }, ep)?.[0]).toBe(404)
        expect(checkMcpRequest({ ...ok, url: '/' }, ep)?.[0]).toBe(404)
    })
})

describe('parseMcpCall', () => {
    it('白名單內的工具與物件參數', () => {
        expect(parseMcpCall('{"tool":"list_todos","args":{"filter":"overdue"}}')).toEqual({ tool: 'list_todos', args: { filter: 'overdue' } })
        expect(parseMcpCall('{"tool":"list_boards"}')).toEqual({ tool: 'list_boards', args: {} })
    })

    it('沒有刪除工具：白名單外一律拒絕', () => {
        expect(parseMcpCall('{"tool":"delete_board","args":{}}')).toBeNull()
        expect(parseMcpCall('{"tool":"__proto__"}')).toBeNull()
    })

    it('壞 JSON、參數不是物件都拒絕', () => {
        expect(parseMcpCall('{')).toBeNull()
        expect(parseMcpCall('{"tool":"read_board","args":[1]}')).toBeNull()
        expect(parseMcpCall('{"tool":"read_board","args":null}')).toBeNull()
    })
})

describe('mcpLogEntry', () => {
    it('只記 id 與長度，不記卡片內容', () => {
        const line = mcpLogEntry(0, 'add_to_inbox', { text: '秘密內容' }, { ok: true, data: { cardId: 'shape:x' } })
        expect(line).not.toContain('秘密內容')
        expect(JSON.parse(line)).toEqual({ at: '1970-01-01T00:00:00.000Z', tool: 'add_to_inbox', ok: true, textLength: 4, newCardId: 'shape:x' })
    })

    it('失敗時記下原因', () => {
        const entry = JSON.parse(mcpLogEntry(0, 'set_todo_checked', { boardId: 'b', cardId: 'c', todoId: 't', checked: true }, { ok: false, error: '找不到' }))
        expect(entry).toMatchObject({ boardId: 'b', cardId: 'c', todoId: 't', checked: true, ok: false, error: '找不到' })
    })
})
