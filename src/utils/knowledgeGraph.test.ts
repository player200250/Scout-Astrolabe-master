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
import { buildGraph, shouldShowNodeLabel, pickNextStep, questTitle, shortenKeepDue, questProgress, type GraphLink } from './knowledgeGraph'

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

describe('shouldShowNodeLabel — LOD（2026-09-30 下修門檻）', () => {
    it('白板標籤不論縮放都嘗試顯示（重疊改由 drawLabels 的讓位處理）', () => {
        expect(shouldShowNodeLabel('board', 5, 0.1)).toBe(true)
    })

    it('卡片標籤：需 val ≥ 2 且 globalScale > 0.5', () => {
        expect(shouldShowNodeLabel('card', 2, 0.6)).toBe(true)
        expect(shouldShowNodeLabel('card', 1, 2)).toBe(false)   // 沒被引用過的孤卡不標
        expect(shouldShowNodeLabel('card', 3, 0.5)).toBe(false) // 剛好 0.5 不顯示
    })

    it('主線／支線不論縮放一律顯示', () => {
        expect(shouldShowNodeLabel('quest', 20, 0.05)).toBe(true)
    })
})

describe('pickNextStep', () => {
    it('取未完成項裡到期日最早的，附（M/D）', () => {
        expect(pickNextStep([
            { text: '投遞', checked: false, dueDate: '2026-10-19' },
            { text: '定色盤', checked: false, dueDate: '2026-10-02' },
            { text: '已做完', checked: true, dueDate: '2026-09-01' },
        ])).toBe('定色盤（10/2）')
    })

    it('都沒有日期就取清單順序第一個未完成項', () => {
        expect(pickNextStep([{ text: 'a', checked: true }, { text: 'b', checked: false }, { text: 'c', checked: false }])).toBe('b')
    })

    it('有日期的排在沒日期的前面', () => {
        expect(pickNextStep([{ text: '沒日期', checked: false }, { text: '有日期', checked: false, dueDate: '2026-12-01' }])).toBe('有日期（12/1）')
    })

    it('全部完成或空清單回 null', () => {
        expect(pickNextStep([{ text: 'x', checked: true }])).toBeNull()
        expect(pickNextStep(undefined)).toBeNull()
    })
})

describe('buildGraph — 主線／支線與不畫的白板（2026-09-30）', () => {
    const quest = (id: string, text: string, tags: string[]): Rec => ({
        typeName: 'shape', type: 'card', id, x: 0, y: 0,
        props: { type: 'todo', text, tags, todos: [{ text: '第一步', checked: false, dueDate: '2026-10-02' }] },
    })

    it('標了 #主線／#支線 的待辦卡成為 quest 節點，帶下一步，並連到所屬白板', () => {
        const { nodes, links } = buildGraph([board('b1', '作品集', [quest('q1', '求職', ['主線']), quest('q2', '遊戲', ['支線']), quest('q3', '一般', [])])], new Map())
        const q1 = nodes.find(n => n.id === 'q1')!
        expect(q1.type).toBe('quest')
        expect(q1.quest).toBe('main')
        expect(q1.nextStep).toBe('第一步（10/2）')
        expect(nodes.find(n => n.id === 'q2')!.quest).toBe('side')
        expect(nodes.some(n => n.id === 'q3')).toBe(false) // 沒標籤的待辦卡仍不上圖
        expect(hasLink(links, 'b1', 'q1', 'parent')).toBe(true)
    })

    it('主頁／收件匣／資料夾／日誌板及其上的卡片都不上圖', () => {
        const flag = (b: BoardRecord, k: string) => ({ ...b, [k]: true }) as BoardRecord
        const { nodes } = buildGraph([
            flag(board('h', '主頁', [card('ch', '主頁卡')]), 'isHome'),
            flag(board('i', '收件匣', [card('ci', '收件卡')]), 'isInbox'),
            flag(board('f', '資料夾', []), 'isFolder'),
            flag(board('j', '日誌', [card('cj', '日記', 'journal')]), 'isJournal'),
            board('b', '一般', [card('cb', '一般卡')]),
        ], new Map())
        expect(nodes.map(n => n.id).sort()).toEqual(['b', 'cb'])
    })
})

describe('buildGraph — 父子白板與 val', () => {
    // 2026-10-02 收掉父子白板：舊資料殘留的 parentId 不再畫成連線
    it('parentId 指向存在的白板也不產生連結', () => {
        const boards = [
            board('b1', '父板', []),
            board('b2', '子板', [], 'b1'),
        ]
        const { links } = buildGraph(boards, new Map())
        expect(hasLink(links, 'b1', 'b2', 'parent')).toBe(false)
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

describe('questTitle／shortenKeepDue（圖上主線標籤）', () => {
    it('去掉開頭 emoji 與「主線：」前綴，在 ·／〔 處截斷', () => {
        expect(questTitle('🎯 主線：求職（Spine 動畫師）· 主角＝星塵拾荒者主角')).toBe('求職（Spine 動畫師）')
        expect(questTitle('🎯 MVP 里程碑 〔8/06 起凍結：求職優先〕')).toBe('MVP 里程碑')
        expect(questTitle('🧹 待清的小尾巴')).toBe('待清的小尾巴')
    })

    it('過長時截斷描述、保留結尾的（M/D）', () => {
        const s = '從星塵拾荒者現有配色挑 3–5 色，定成限定色盤（10/2）'
        const out = shortenKeepDue(s, 20)
        expect(out.endsWith('…（10/2）')).toBe(true)
        expect(out.length).toBeLessThanOrEqual(20)
        expect(shortenKeepDue('短（1/1）', 20)).toBe('短（1/1）')
    })
})

describe('questProgress（點主線／支線節點的進度面板）', () => {
    const todos = [
        { id: 'a', text: '已完成的', checked: true, dueDate: '2026-09-01' },
        { id: 'b', text: '❌ 失敗｜沒做到的', checked: true, dueDate: '2026-09-02' },
        { id: 'c', text: '晚一點', checked: false, dueDate: '2026-10-04' },
        { id: 'd', text: '逾期的', checked: false, dueDate: '2026-09-30' },
        { id: 'e', text: '沒日期', checked: false, dueDate: null },
        { id: 'f', text: '   ', checked: false, dueDate: null },
    ]

    it('失敗項另外計數、不算完成；空白項不計', () => {
        const p = questProgress(todos, '2026-10-01')
        expect(p).toMatchObject({ done: 1, failed: 1, total: 5 })
    })

    it('失敗項去掉前綴顯示', () => {
        const p = questProgress(todos, '2026-10-01')
        expect(p.items.find(i => i.key === 'b')).toMatchObject({ status: 'failed', text: '沒做到的' })
    })

    it('下一步＝最早到期的未完成項（與 pickNextStep 同規則），且只有一個', () => {
        const p = questProgress(todos, '2026-10-01')
        expect(p.items.filter(i => i.isNext).map(i => i.key)).toEqual(['d'])
        expect(pickNextStep(todos)).toBe('逾期的（9/30）')
    })

    it('只有未完成且日期早於今天才算逾期；今天到期不算', () => {
        const p = questProgress(todos, '2026-10-01')
        expect(p.items.filter(i => i.overdue).map(i => i.key)).toEqual(['d'])
        expect(questProgress([{ text: 'x', dueDate: '2026-10-01' }], '2026-10-01').items[0].overdue).toBe(false)
    })

    it('未完成照清單順序在前，完成／失敗沉底', () => {
        const p = questProgress(todos, '2026-10-01')
        expect(p.items.map(i => i.key)).toEqual(['c', 'd', 'e', 'a', 'b'])
    })

    it('全部完成時沒有下一步；無待辦回全 0', () => {
        expect(questProgress([{ text: 'x', checked: true }], '2026-10-01').items.some(i => i.isNext)).toBe(false)
        expect(questProgress(undefined, '2026-10-01')).toEqual({ done: 0, failed: 0, total: 0, items: [] })
    })
})
