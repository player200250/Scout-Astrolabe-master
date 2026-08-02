// @vitest-environment jsdom
// src/mobile/mobileCards.test.ts
import { describe, it, expect } from 'vitest'
import type { TLEditorSnapshot } from 'tldraw'
import { toMobileCard, readBoardCards, splitCardText, summarizeCards } from './mobileCards'

const card = (id: string, props: Record<string, unknown>, x = 0, y = 0) => ({ id, x, y, props })

function snap(shapes: { id: string; x: number; y: number; props: Record<string, unknown> }[]): TLEditorSnapshot {
    const store: Record<string, unknown> = {
        'page:page': { typeName: 'page', id: 'page:page', name: 'Page 1' },
    }
    for (const s of shapes) {
        store[s.id] = { typeName: 'shape', id: s.id, type: 'card', x: s.x, y: s.y, props: s.props }
    }
    return { document: { store, schema: { schemaVersion: 2, sequences: {} } }, session: {} } as unknown as TLEditorSnapshot
}

describe('splitCardText', () => {
    // ⚠️ 這條是第一版寫錯被測試抓到的地方：stripHtml 會把區塊元素之間壓成一個
    // 空格，所以「剝完再切第一行」永遠切不出標題（<h2>標題</h2><p>內文</p>
    // 剝完是「標題 內文」一整行）。必須在剝掉 HTML **之前**先看 H1/H2。
    it('有 H1/H2 時用它當標題，其餘是內文', () => {
        expect(splitCardText('<h2>標題</h2><p>內文</p>')).toEqual({ title: '標題', body: '內文' })
    })

    it('沒有標題標籤時退成第一行當標題（速記卡就是純文字）', () => {
        expect(splitCardText('第一行\n第二行')).toEqual({ title: '第一行', body: '第二行' })
    })

    it('純文字單行時 body 為空', () => {
        expect(splitCardText('只有這行')).toEqual({ title: '只有這行', body: '' })
    })

    it('全空回兩個空字串', () => {
        expect(splitCardText('   \n  ')).toEqual({ title: '', body: '' })
    })
})

describe('toMobileCard', () => {
    it('文字卡：HTML 會被剝掉', () => {
        const c = toMobileCard(card('shape:a', { type: 'text', text: '<h2>標題</h2><p>內文</p>' }))
        expect(c.type).toBe('text')
        expect(c.title).toBe('標題')
        expect(c.body).toContain('內文')
    })

    it('待辦卡：只留有文字的項目，勾選狀態與到期日保留', () => {
        const c = toMobileCard(card('shape:t', {
            type: 'todo',
            todos: [
                { text: '做完的', checked: true, dueDate: '2026-08-10' },
                { text: '沒做的', checked: false },
                { text: '', checked: false },   // 空項目不該出現在手機上
            ],
        }))
        expect(c.todos).toEqual([
            { text: '做完的', checked: true, dueDate: '2026-08-10' },
            { text: '沒做的', checked: false, dueDate: null },
        ])
    })

    // 各型別的「標題」來源不同，硬套第一行的話這幾種會整列空白
    it('連結卡沒有文字時用 title，再沒有就用網址', () => {
        expect(toMobileCard(card('shape:l', { type: 'link', url: 'https://x.dev', title: '網頁標題' })).title).toBe('網頁標題')
        expect(toMobileCard(card('shape:l2', { type: 'link', url: 'https://x.dev' })).title).toBe('https://x.dev')
    })

    it('檔案卡用原始檔名當標題', () => {
        const c = toMobileCard(card('shape:f', { type: 'file', originalName: '報告.pdf' }))
        expect(c.title).toBe('報告.pdf')
        expect(c.fileName).toBe('報告.pdf')
    })

    it('認不得的型別退成 unknown 而不是整張卡消失', () => {
        expect(toMobileCard(card('shape:x', { type: '未來的新型別' })).type).toBe('unknown')
    })

    it('tags 只收字串（壞資料不會讓畫面炸掉）', () => {
        const c = toMobileCard(card('shape:g', { type: 'text', text: 'x', tags: ['ok', 42, null] }))
        expect(c.tags).toEqual(['ok'])
    })

    it('完全沒有 props 也不會丟例外', () => {
        const c = toMobileCard(card('shape:e', {}))
        expect(c.type).toBe('unknown')
        expect(c.title).toBe('')
        expect(c.todos).toEqual([])
    })
})

describe('readBoardCards', () => {
    // 不排序的話手機上的順序會跟桌機看到的排版對不起來，同一塊板像兩塊板
    it('照畫布位置排序：先上下、再左右', () => {
        const s = snap([
            card('shape:c', { type: 'text', text: 'C' }, 10, 300),
            card('shape:b', { type: 'text', text: 'B' }, 400, 10),
            card('shape:a', { type: 'text', text: 'A' }, 10, 10),
        ])
        expect(readBoardCards(s).map(c => c.title)).toEqual(['A', 'B', 'C'])
    })

    // 同一「列」的卡片 y 常差幾 px，不容差的話會被拆成好幾列、左右順序就亂了
    it('y 相差在 40px 內視為同一列，依 x 排', () => {
        const s = snap([
            card('shape:r', { type: 'text', text: '右' }, 500, 30),
            card('shape:l', { type: 'text', text: '左' }, 100, 0),
        ])
        expect(readBoardCards(s).map(c => c.title)).toEqual(['左', '右'])
    })

    it('null snapshot 回空陣列', () => {
        expect(readBoardCards(null)).toEqual([])
    })
})

describe('summarizeCards', () => {
    it('空板直說', () => {
        expect(summarizeCards([])).toBe('空白板')
    })

    it('有未完成待辦時一併報出來', () => {
        const cards = readBoardCards(snap([
            card('shape:t', { type: 'todo', todos: [{ text: 'a', checked: false }, { text: 'b', checked: true }] }),
            card('shape:x', { type: 'text', text: 'hi' }),
        ]))
        expect(summarizeCards(cards)).toBe('2 張卡 · 1 項未完成')
    })

    it('全部完成時不顯示待辦數', () => {
        const cards = readBoardCards(snap([
            card('shape:t', { type: 'todo', todos: [{ text: 'a', checked: true }] }),
        ]))
        expect(summarizeCards(cards)).toBe('1 張卡')
    })
})
