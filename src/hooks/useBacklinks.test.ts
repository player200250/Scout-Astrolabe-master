// @vitest-environment jsdom
// src/hooks/useBacklinks.test.ts
//
// useBacklinks 不碰資料庫：它只接收一個 boards 陣列，從每張白板的
// snapshot.document.store 讀卡片、抓 [[xxx]] 連結。所以這裡「不需要 mock DB」，
// 只要自己捏一個假的 snapshot 物件餵進去即可。
//
// 測試重點分兩塊：
//   1) extractCardName（純函式）—— 標題擷取／純文字 fallback 的各分支。
//   2) useBacklinks（hook）—— 尤其是 TD4 改成的「增量更新」邏輯：
//      沒變動時要回傳同一個物件、snapshot 變了要重掃、白板被刪要清掉、改名要更新。
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { TLEditorSnapshot } from 'tldraw'
import { useBacklinks, extractCardName } from './useBacklinks'

/* ---------------------------------------------------------------
   小工具：捏假資料
--------------------------------------------------------------- */

// 一筆 store record。getSnapshotStore 只讀 snapshot.document.store，
// 所以這裡欄位夠用就好（typeName/type/props/x/y）。
type Rec = Record<string, unknown>

// 把一堆 record 包成 useBacklinks 看得懂的 snapshot 形狀。
function makeSnapshot(records: Record<string, Rec>): TLEditorSnapshot {
    return { document: { store: records } } as unknown as TLEditorSnapshot
}

// 一張 card shape；type 預設 'text'（會被掃描），可改 'journal' 或別的。
function card(
    id: string,
    text: string,
    over: { type?: string; x?: number; y?: number } = {},
): Rec {
    return {
        typeName: 'shape',
        type: 'card',
        id,
        x: over.x ?? 0,
        y: over.y ?? 0,
        props: { type: over.type ?? 'text', text },
    }
}

// 只放一張卡片的白板 snapshot 的捷徑。
function boardWith(...cards: Rec[]): TLEditorSnapshot {
    const store: Record<string, Rec> = {}
    for (const c of cards) store[c.id as string] = c
    return makeSnapshot(store)
}

interface Board {
    id: string
    name: string
    snapshot: TLEditorSnapshot | null
}

/* ===============================================================
   1. extractCardName（純函式）
=============================================================== */
describe('extractCardName', () => {
    it('空字串或 null 回 null', () => {
        expect(extractCardName('')).toBeNull()
        // @ts-expect-error 故意傳 null 驗證防呆
        expect(extractCardName(null)).toBeNull()
    })

    it('有 H1 標題時取標題文字', () => {
        expect(extractCardName('<h1>專案計畫</h1><p>內文</p>')).toBe('專案計畫')
    })

    it('有 H2 標題時也取標題文字', () => {
        expect(extractCardName('<h2>會議記錄</h2>')).toBe('會議記錄')
    })

    it('標題內含其他標籤時會剝掉只留純文字', () => {
        expect(extractCardName('<h1>重要<strong>標題</strong></h1>')).toBe('重要標題')
    })

    it('沒有標題時取前 40 字純文字', () => {
        const long = '一'.repeat(60)
        const name = extractCardName(`<p>${long}</p>`)
        expect(name).toBe('一'.repeat(40))
    })

    it('標題為空時 fallback 到內文純文字', () => {
        // H1 是空的 → hMatch 命中但 name 為空 → 走 fallback 取內文
        expect(extractCardName('<h1></h1><p>備援內容</p>')).toBe('備援內容')
    })

    it('全是標籤、剝完沒有文字 → null', () => {
        expect(extractCardName('<p></p><br/>')).toBeNull()
    })
})

/* ===============================================================
   2. useBacklinks —— 基本掃描行為
=============================================================== */
describe('useBacklinks — 掃描', () => {
    it('抓到 [[xxx]] 並同時建立 forwardLinks 與 backlinks', () => {
        const boards: Board[] = [
            { id: 'b1', name: '白板一', snapshot: boardWith(card('shape:a', '看 [[目標]]', { x: 10, y: 20 })) },
        ]
        const { result } = renderHook(() => useBacklinks(boards))

        // forwardLinks：shapeId → 它引用的名稱清單
        expect(result.current.forwardLinks.get('shape:a')).toEqual(['目標'])

        // backlinks：被引用名稱（小寫）→ 引用它的卡片清單
        const entries = result.current.backlinks.get('目標')!
        expect(entries).toHaveLength(1)
        expect(entries[0]).toMatchObject({
            boardId: 'b1',
            boardName: '白板一',
            shapeId: 'shape:a',
            preview: '看 [[目標]]',
            x: 10,
            y: 20,
        })
    })

    it('backlinks 的 key 一律轉小寫', () => {
        const boards: Board[] = [
            { id: 'b1', name: 'B1', snapshot: boardWith(card('shape:a', '[[Foo]]')) },
        ]
        const { result } = renderHook(() => useBacklinks(boards))
        expect(result.current.backlinks.has('foo')).toBe(true)
        expect(result.current.backlinks.has('Foo')).toBe(false)
    })

    it('同一張卡片重複引用同一個名稱會去重', () => {
        const boards: Board[] = [
            { id: 'b1', name: 'B1', snapshot: boardWith(card('shape:a', '[[Foo]] 又 [[Foo]] 再 [[Foo]]')) },
        ]
        const { result } = renderHook(() => useBacklinks(boards))
        expect(result.current.forwardLinks.get('shape:a')).toEqual(['Foo'])
        expect(result.current.backlinks.get('foo')).toHaveLength(1)
    })

    it('journal 卡片也會被掃描', () => {
        const boards: Board[] = [
            { id: 'b1', name: 'B1', snapshot: boardWith(card('shape:j', '[[每日]]', { type: 'journal' })) },
        ]
        const { result } = renderHook(() => useBacklinks(boards))
        expect(result.current.backlinks.has('每日')).toBe(true)
    })

    it('非 text/journal 的卡片、非 card 的 shape、無連結的卡片都跳過', () => {
        const boards: Board[] = [
            {
                id: 'b1',
                name: 'B1',
                snapshot: makeSnapshot({
                    'shape:img': card('shape:img', '[[圖片]]', { type: 'image' }), // 非 text/journal → 跳過
                    'shape:plain': card('shape:plain', '沒有連結的內文'),            // 有掃到但無連結 → 不進 map
                    'shape:arrow': { typeName: 'shape', type: 'arrow', id: 'shape:arrow', props: {} }, // 非 card
                    'page:1': { typeName: 'page', id: 'page:1' },                    // 非 shape
                }),
            },
        ]
        const { result } = renderHook(() => useBacklinks(boards))
        expect(result.current.backlinks.size).toBe(0)
        expect(result.current.forwardLinks.size).toBe(0)
    })

    it('snapshot 為 null 的白板回空結果，不報錯', () => {
        const boards: Board[] = [{ id: 'b1', name: 'B1', snapshot: null }]
        const { result } = renderHook(() => useBacklinks(boards))
        expect(result.current.forwardLinks.size).toBe(0)
        expect(result.current.backlinks.size).toBe(0)
    })

    it('preview 取純文字前 80 字（HTML 標籤被剝除）', () => {
        const html = `<p>${'字'.repeat(100)}[[長文]]</p>`
        const boards: Board[] = [{ id: 'b1', name: 'B1', snapshot: boardWith(card('shape:a', html)) }]
        const { result } = renderHook(() => useBacklinks(boards))
        const preview = result.current.backlinks.get('長文')![0].preview
        expect(preview).toBe('字'.repeat(80))
    })

    it('跨白板引用同一名稱會合併到同一個 backlinks 陣列', () => {
        const boards: Board[] = [
            { id: 'b1', name: '一', snapshot: boardWith(card('shape:a', '[[共同]]')) },
            { id: 'b2', name: '二', snapshot: boardWith(card('shape:b', '[[共同]]')) },
        ]
        const { result } = renderHook(() => useBacklinks(boards))
        const entries = result.current.backlinks.get('共同')!
        expect(entries).toHaveLength(2)
        expect(entries.map(e => e.boardId).sort()).toEqual(['b1', 'b2'])
    })
})

/* ===============================================================
   3. useBacklinks —— 增量更新（TD4 的核心，風險最集中）
=============================================================== */
describe('useBacklinks — 增量更新', () => {
    it('boards 內容沒變時 rerender 回傳「同一個物件」（命中快取，不重算）', () => {
        const boards: Board[] = [
            { id: 'b1', name: 'B1', snapshot: boardWith(card('shape:a', '[[X]]')) },
        ]
        const { result, rerender } = renderHook(({ b }) => useBacklinks(b), {
            initialProps: { b: boards },
        })
        const first = result.current
        // 傳同一個 board 物件（snapshot/name reference 沒變）→ 應走 early return
        rerender({ b: boards })
        expect(result.current).toBe(first) // toBe = 同一個 reference
    })

    it('某張白板的 snapshot 換新時，重掃並反映新連結', () => {
        const b1v1: Board = { id: 'b1', name: 'B1', snapshot: boardWith(card('shape:a', '[[舊]]')) }
        const { result, rerender } = renderHook(({ b }) => useBacklinks(b), {
            initialProps: { b: [b1v1] },
        })
        expect(result.current.backlinks.has('舊')).toBe(true)

        // 換成新的 snapshot reference（內容也換成 [[新]]）
        const b1v2: Board = { ...b1v1, snapshot: boardWith(card('shape:a', '[[新]]')) }
        rerender({ b: [b1v2] })

        expect(result.current.backlinks.has('新')).toBe(true)
        expect(result.current.backlinks.has('舊')).toBe(false)
    })

    it('白板被移除時，其 backlinks 從合併結果中消失', () => {
        const b1: Board = { id: 'b1', name: '一', snapshot: boardWith(card('shape:a', '[[共同]]')) }
        const b2: Board = { id: 'b2', name: '二', snapshot: boardWith(card('shape:b', '[[共同]]')) }
        const { result, rerender } = renderHook(({ b }) => useBacklinks(b), {
            initialProps: { b: [b1, b2] },
        })
        expect(result.current.backlinks.get('共同')).toHaveLength(2)

        // 移除 b2
        rerender({ b: [b1] })
        const entries = result.current.backlinks.get('共同')!
        expect(entries).toHaveLength(1)
        expect(entries[0].boardId).toBe('b1')
    })

    it('白板改名時重掃，backlinks 內的 boardName 跟著更新', () => {
        const v1: Board = { id: 'b1', name: '舊名', snapshot: boardWith(card('shape:a', '[[X]]')) }
        const { result, rerender } = renderHook(({ b }) => useBacklinks(b), {
            initialProps: { b: [v1] },
        })
        expect(result.current.backlinks.get('x')![0].boardName).toBe('舊名')

        // 只改 name，snapshot 沿用（reference 不變）→ 仍需重掃，因為 c.name !== b.name
        const v2: Board = { ...v1, name: '新名' }
        rerender({ b: [v2] })
        expect(result.current.backlinks.get('x')![0].boardName).toBe('新名')
    })

    it('新增白板時，舊白板不重掃但新白板被納入合併', () => {
        const b1: Board = { id: 'b1', name: '一', snapshot: boardWith(card('shape:a', '[[A]]')) }
        const { result, rerender } = renderHook(({ b }) => useBacklinks(b), {
            initialProps: { b: [b1] },
        })
        expect(result.current.backlinks.has('a')).toBe(true)
        expect(result.current.backlinks.has('b')).toBe(false)

        const b2: Board = { id: 'b2', name: '二', snapshot: boardWith(card('shape:b', '[[B]]')) }
        rerender({ b: [b1, b2] })
        // 兩者都在最終結果（b1 來自快取、b2 新掃）
        expect(result.current.backlinks.has('a')).toBe(true)
        expect(result.current.backlinks.has('b')).toBe(true)
    })
})
