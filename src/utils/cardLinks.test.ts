import { describe, it, expect } from 'vitest'
import { resolveLinkTarget, buildLinkTargets, filterLinkTargets, groupLinkTargets } from './cardLinks'
import type { CardTarget } from '../hooks/useBacklinks'

const card = (name: string, boardId = 'b1', shapeId = 'shape:1'): CardTarget => ({
    boardId, boardName: '技術債', shapeId, name, x: 10, y: 20,
})
const indexOf = (...cards: CardTarget[]) => {
    const m = new Map<string, CardTarget[]>()
    for (const c of cards) {
        const k = c.name.toLowerCase()
        const arr = m.get(k)
        if (arr) arr.push(c)
        else m.set(k, [c])
    }
    return m
}

describe('resolveLinkTarget', () => {
    const boards = [{ id: 'b1', name: '技術債' }, { id: 'b2', name: '競品參考' }]

    it('白板名 → 解析成白板', () => {
        expect(resolveLinkTarget('技術債', boards, new Map())).toEqual({ kind: 'board', boardId: 'b1' })
    })

    it('大小寫不敏感', () => {
        const idx = indexOf(card('Heptabase'))
        expect(resolveLinkTarget('heptabase', boards, idx)).toEqual({ kind: 'card', target: card('Heptabase') })
    })

    it('B-LINK：卡片名 → 解析成卡片（此前只比對白板就 return，連結是死的）', () => {
        const idx = indexOf(card('Heptabase', 'b2', 'shape:h'))
        const r = resolveLinkTarget('Heptabase', boards, idx)
        expect(r).toEqual({ kind: 'card', target: { boardId: 'b2', boardName: '技術債', shapeId: 'shape:h', name: 'Heptabase', x: 10, y: 20 } })
    })

    it('白板優先於卡片（與 knowledgeGraph 一致）', () => {
        const idx = indexOf(card('技術債', 'b9', 'shape:x'))
        expect(resolveLinkTarget('技術債', boards, idx)).toEqual({ kind: 'board', boardId: 'b1' })
    })

    it('撞名的卡片取第一張', () => {
        const idx = indexOf(card('重複', 'b1', 'shape:1'), card('重複', 'b2', 'shape:2'))
        const r = resolveLinkTarget('重複', boards, idx)
        expect(r).toMatchObject({ kind: 'card', target: { shapeId: 'shape:1' } })
    })

    it('前後空白會被忽略', () => {
        expect(resolveLinkTarget('  技術債  ', boards, new Map())).toEqual({ kind: 'board', boardId: 'b1' })
    })

    it('都找不到 → null（呼叫端據此不跳轉）', () => {
        expect(resolveLinkTarget('不存在', boards, new Map())).toBeNull()
    })

    it('空字串 → null', () => {
        expect(resolveLinkTarget('   ', boards, new Map())).toBeNull()
    })
})

describe('buildLinkTargets', () => {
    it('白板在前、卡片在後', () => {
        expect(buildLinkTargets(['技術債'], ['Heptabase'])).toEqual([
            { name: '技術債', kind: 'board' },
            { name: 'Heptabase', kind: 'card' },
        ])
    })

    it('卡片名與白板名重複時只留白板（因為解析時白板優先，留著卡片會誤導）', () => {
        expect(buildLinkTargets(['技術債'], ['技術債', 'Notion'])).toEqual([
            { name: '技術債', kind: 'board' },
            { name: 'Notion', kind: 'card' },
        ])
    })

    it('各自去重', () => {
        expect(buildLinkTargets(['A', 'A'], ['B', 'B'])).toEqual([
            { name: 'A', kind: 'board' },
            { name: 'B', kind: 'card' },
        ])
    })
})

describe('filterLinkTargets', () => {
    const targets = buildLinkTargets(['技術債', '競品參考'], ['Heptabase', 'Notion', '未連結提及'])

    it('子字串比對、不分大小寫', () => {
        expect(filterLinkTargets(targets, 'hepta')).toEqual([{ name: 'Heptabase', kind: 'card' }])
    })

    it('空 query 回傳全部（未超過各組上限時）', () => {
        expect(filterLinkTargets(targets, '')).toHaveLength(5)
    })

    it('各組上限分開算', () => {
        expect(filterLinkTargets(targets, '', { board: 1, card: 2 })).toEqual([
            { name: '技術債', kind: 'board' },
            { name: 'Heptabase', kind: 'card' },
            { name: 'Notion', kind: 'card' },
        ])
    })

    it('白板很多時不會把卡片擠光（實測 7 個白板吃掉 8 格總額的回歸）', () => {
        const many = buildLinkTargets(
            ['收件匣', '我的白板', '主頁白板', '主頁白板 (2)', '產品重設計', '競品參考', '技術債'],
            ['Heptabase', 'Notion'],
        )
        const got = filterLinkTargets(many, '')
        expect(got.filter(t => t.kind === 'board')).toHaveLength(5)   // 受 board 上限
        expect(got.filter(t => t.kind === 'card')).toEqual([          // 卡片仍看得到
            { name: 'Heptabase', kind: 'card' },
            { name: 'Notion', kind: 'card' },
        ])
    })

    it('沒命中回空陣列', () => {
        expect(filterLinkTargets(targets, 'zzz')).toEqual([])
    })
})

describe('groupLinkTargets', () => {
    it('分成白板／卡片兩組', () => {
        const g = groupLinkTargets(buildLinkTargets(['技術債'], ['Notion']))
        expect(g).toEqual([
            { group: '白板', items: [{ name: '技術債', kind: 'board' }] },
            { group: '卡片', items: [{ name: 'Notion', kind: 'card' }] },
        ])
    })

    it('某組為空時不顯示該組標題', () => {
        expect(groupLinkTargets(buildLinkTargets([], ['Notion']))).toEqual([
            { group: '卡片', items: [{ name: 'Notion', kind: 'card' }] },
        ])
    })
})
