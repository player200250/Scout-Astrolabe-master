// src/hooks/useMcpBridge.ts
//
// 主視窗這一端的 Claude Code（MCP）接線，見 docs/adr/0010-claude-code-mcp-bridge.md。
// main 轉來請求 → 這裡再驗一次參數 → 讀取用純函式算、寫入交給既有 handler → 回覆。
//
// 請求一律排隊、一個做完才做下一個：寫入 handler 是從 React state 的 boards 算新 snapshot，
// 連續兩次寫同一塊板時，第二次必須等第一次的 setBoards 生效，否則會拿舊 snapshot 把第一次蓋掉
// （Claude 很常一口氣勾好幾項）。所以寫完會等 boards 換新再處理下一個。

import { useEffect, useRef } from 'react'
import type { BoardRecord } from '../db'
import { parseMcpArgs, listBoards, readBoard, searchCards, listTodos } from '../utils/mcpTools'
import type { McpRequest, McpResult } from '../utils/mcpTools'
import type { TodoChange } from './useTodoEdits'
import { getTodayStr } from '../utils/date'
import { onMcpRequest, sendMcpResponse, setMcpReady } from '../platform/mcpBridge'

export interface McpBridgeHandlers {
    onAddToInbox: (text: string) => string | null
    onEditTodo: (boardId: string, shapeId: string, todoId: string, change: TodoChange) => boolean
}

/** 寫完等 boards 換新最多等多久；逾時照樣往下（寧可慢，不要卡死整條佇列） */
const SETTLE_TIMEOUT_MS = 1000

export function useMcpBridge(boards: BoardRecord[], loading: boolean, handlers: McpBridgeHandlers): void {
    const boardsRef = useRef(boards)
    const handlersRef = useRef(handlers)
    const settleRef = useRef<(() => void) | null>(null)
    useEffect(() => {
        boardsRef.current = boards
        handlersRef.current = handlers
    })
    useEffect(() => {
        settleRef.current?.()
        settleRef.current = null
    }, [boards])

    useEffect(() => {
        if (loading) return
        setMcpReady(true)
        return () => setMcpReady(false)
    }, [loading])

    useEffect(() => {
        let queue = Promise.resolve()

        const waitForBoards = () => new Promise<void>(resolve => {
            const timer = setTimeout(resolve, SETTLE_TIMEOUT_MS)
            settleRef.current = () => { clearTimeout(timer); resolve() }
        })

        const run = async (req: McpRequest): Promise<McpResult> => {
            const args = parseMcpArgs(req.tool, req.args)
            if (typeof args === 'string') return { ok: false, error: args }
            const boards = boardsRef.current
            const h = handlersRef.current
            switch (args.tool) {
                case 'list_boards': return { ok: true, data: listBoards(boards) }
                case 'read_board': return readBoard(boards, args.boardId)
                case 'search_cards': return { ok: true, data: searchCards(boards, args.query) }
                case 'list_todos': return { ok: true, data: listTodos(boards, args.filter, getTodayStr()) }
                case 'add_to_inbox': {
                    const settled = waitForBoards()
                    const cardId = h.onAddToInbox(args.text)
                    if (!cardId) { settleRef.current = null; return { ok: false, error: '找不到收件匣' } }
                    await settled
                    return { ok: true, data: { cardId } }
                }
                case 'set_todo_checked':
                case 'set_todo_due': {
                    const change: TodoChange = args.tool === 'set_todo_checked' ? { checked: args.checked } : { dueDate: args.dueDate }
                    const settled = waitForBoards()
                    if (!h.onEditTodo(args.boardId, args.cardId, args.todoId, change)) {
                        settleRef.current = null
                        return { ok: false, error: '找不到這個待辦（白板、卡片或項目 id 不對，或白板在垃圾桶）' }
                    }
                    await settled
                    return { ok: true, data: { done: true } }
                }
            }
        }

        return onMcpRequest(req => {
            queue = queue.then(async () => {
                let result: McpResult
                try { result = await run(req) } catch (err) { result = { ok: false, error: `主視窗執行失敗：${String(err)}` } }
                sendMcpResponse(req.id, result)
            })
        })
    }, [])
}
