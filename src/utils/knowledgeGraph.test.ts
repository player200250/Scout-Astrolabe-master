// @vitest-environment jsdom
// src/utils/knowledgeGraph.test.ts
//
// jsdom 環境：extractCardName 的純文字 fallback 走 stringUtils.stripHtml，需要 DOMParser。
//
// buildGraph（知識圖譜資料建構）測試。重點在 A6 Bundle A 修正的行為：
//   - 卡片命名走 extractCardName（H1/H2 標題優先），使 [[標題]] 能對到卡片；
//   - wikilink 連結直接取 forwardLinks（已去重），不再自行解析 HTML；
//   - 白板名優先於卡片名的目標解析、父子白板連結、refCount → val。
import { describe, it, expect } from 'vitest'
import type { TLEditorSnapshot } from 'tldraw'
import type { BoardRecord } from '../db'
import { buildGraph, shouldShowNodeLabel, type GraphLink } from './knowledgeGraph'

/* --------------------------------------------------------------- 捏假資料 */
type Rec = Record<string, unknown>

function makeSnapshot(records: Record<string, Rec>): TLEditorSnapshot {
    return { document: { store: records } } as unknown as TLEditorSnapshot
}

function card(id: string, text: string, type: 'text' | 'journal' | 'todo' = 'text'): Rec {
    return { typeName: 'shape', type: 'card', id, x: 0, y: 0, props: { type, text } }
}

function board(id: string, name: string, cards: Rec[], parentId?: string): BoardRecord {
    const store: Record<string, Rec> = {}
    for (const c of cards) store[c.id as string] = c
    return { id, name, snapshot: makeSnapshot(store), parentId: parentId ?? null } as unknown as BoardRecord
}

/** 找出某條 wikilink 連結（source/target 皆為字串 id）。 */
function hasLink(links: GraphLink[], source: string, target: string, type: GraphLink['type'] = 'wikilink'): boolean {
    return links.some(l => l.source === source && l.target === target && l.type === type)
}

/* =============================================================== 測試 */
describe('buildGraph — 節點', () => {
    it('只把 text / journal 卡片建成卡片節點，其餘型別忽略', () => {
        const boards = [board('b1', '板一', [
            card('c1', '<p>純文字</p>', 'text'),
            card('c2', '<p>日記</p>', 'journal'),
            card('c3', '<p>待辦</p>', 'todo'),
        ])]
        const { nodes } = buildGraph(boards, new Map())
        const cardNodes = nodes.filter(n => n.type === 'card')
        expect(cardNodes.map(n => n.id).sort()).toEqual(['c1', 'c2'])
        // 每張白板也各有一個 board 節點
        expect(nodes.filter(n => n.type === 'board').map(n => n.id)).toEqual(['b1'])
    })

    it('卡片命名用 extractCardName：有 H1 標題時取標題（而非整段前 48 字）', () => {
        const boards = [board('b1', '板一', [card('c1', '<h1>專案計畫</h1><p>一些內文</p>')])]
        const { nodes } = buildGraph(boards, new Map())
        expect(nodes.find(n => n.id === 'c1')?.name).toBe('專案計畫')
    })
})

describe('buildGraph — wikilink 連結（來自 forwardLinks）', () => {
    it('卡片名對齊 extractCardName：[[H1 標題]] 能連到該卡片', () => {
        // c1 標題「專案計畫」，c2 引用 [[專案計畫]]。
        // 舊版用 firstLine（H1+內文攤平）當名，[[專案計畫]] 會對不上；改用 extractCardName 後應連上。
        const boards = [board('b1', '板一', [
            card('c1', '<h1>專案計畫</h1><p>細節</p>'),
            card('c2', '<p>see [[專案計畫]]</p>'),
        ])]
        const forwardLinks = new Map<string, string[]>([['c2', ['專案計畫']]])
        const { links } = buildGraph(boards, forwardLinks)
        expect(hasLink(links, 'c2', 'c1')).toBe(true)
    })

    it('白板名優先於卡片名：同名時連到白板節點', () => {
        // 白板「筆記」與卡片標題「筆記」同名，[[筆記]] 應連到白板 b2。
        const boards = [
            board('b1', '板一', [
                card('c1', '<h1>筆記</h1>'),
                card('c2', '<p>[[筆記]]</p>'),
            ]),
            board('b2', '筆記', []),
        ]
        const forwardLinks = new Map<string, string[]>([['c2', ['筆記']]])
        const { links } = buildGraph(boards, forwardLinks)
        expect(hasLink(links, 'c2', 'b2')).toBe(true)
        expect(hasLink(links, 'c2', 'c1')).toBe(false)
    })

    it('forwardLinks 已去重：同一目標只產生一條連結、refCount 只 +1', () => {
        const boards = [board('b1', '板一', [
            card('c1', '<h1>目標</h1>'),
            card('c2', '<p>[[目標]] ... [[目標]]</p>'),
        ])]
        // useBacklinks 會去重，forwardLinks 對 c2 只給一個「目標」
        const forwardLinks = new Map<string, string[]>([['c2', ['目標']]])
        const { nodes, links } = buildGraph(boards, forwardLinks)
        expect(links.filter(l => l.source === 'c2' && l.target === 'c1').length).toBe(1)
        // c1 被引用一次：val = 1(卡片基底) + 1(refCount) = 2
        expect(nodes.find(n => n.id === 'c1')?.val).toBe(2)
    })

    it('未知目標名不產生連結；不自我連結', () => {
        const boards = [board('b1', '板一', [card('c1', '<p>[[不存在]] [[自己]]</p>')])]
        const forwardLinks = new Map<string, string[]>([['c1', ['不存在', '自己']]])
        const { links } = buildGraph(boards, forwardLinks)
        expect(links.filter(l => l.type === 'wikilink')).toHaveLength(0)
    })
})

describe('shouldShowNodeLabel — LOD', () => {
    it('白板標籤：globalScale > 0.6 才顯示', () => {
        expect(shouldShowNodeLabel('board', 5, 0.7)).toBe(true)
        expect(shouldShowNodeLabel('board', 5, 0.6)).toBe(false)
        expect(shouldShowNodeLabel('board', 5, 0.3)).toBe(false)
    })

    it('卡片標籤：需 val ≥ 3 且放大（globalScale > 1.2）', () => {
        expect(shouldShowNodeLabel('card', 3, 1.5)).toBe(true)
        expect(shouldShowNodeLabel('card', 5, 1.2)).toBe(false) // 剛好 1.2 不顯示
        expect(shouldShowNodeLabel('card', 2, 2)).toBe(false)   // val 太低
        expect(shouldShowNodeLabel('card', 3, 1.0)).toBe(false) // 未放大
    })

    it('縮到全局（globalScale 很小）時卡片與白板標籤都隱藏', () => {
        expect(shouldShowNodeLabel('card', 10, 0.2)).toBe(false)
        expect(shouldShowNodeLabel('board', 10, 0.2)).toBe(false)
    })
})

describe('buildGraph — 父子白板與 val', () => {
    it('parentId 指向存在的白板時產生 parent 連結', () => {
        const boards = [
            board('b1', '父板', []),
            board('b2', '子板', [], 'b1'),
        ]
        const { links } = buildGraph(boards, new Map())
        expect(hasLink(links, 'b1', 'b2', 'parent')).toBe(true)
    })

    it('parentId 指向不存在的白板時不產生 parent 連結', () => {
        const boards = [board('b2', '子板', [], 'ghost')]
        const { links } = buildGraph(boards, new Map())
        expect(links.filter(l => l.type === 'parent')).toHaveLength(0)
    })

    it('白板節點 val = 5 + 被引用次數', () => {
        const boards = [
            board('b1', '板一', [card('c1', '<p>[[目標板]]</p>')]),
            board('b2', '目標板', []),
        ]
        const forwardLinks = new Map<string, string[]>([['c1', ['目標板']]])
        const { nodes } = buildGraph(boards, forwardLinks)
        expect(nodes.find(n => n.id === 'b2')?.val).toBe(6)
    })
})
