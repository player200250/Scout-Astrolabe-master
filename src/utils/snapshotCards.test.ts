// src/utils/snapshotCards.test.ts
import { describe, it, expect } from 'vitest'
import { ensurePageScaffold, nextAppendX, lastShapeIndex, gridLayout, nextGridSlot } from './snapshotCards'
import type { TLSnapshotStore } from './snapshot'

const shape = (id: string, x: number, w: number, index?: string): TLSnapshotStore[string] => ({
    typeName: 'shape', id, type: 'card', x, y: 0, index, props: { w },
})

describe('ensurePageScaffold', () => {
    it('空 store 補上 document 與 page，回傳預設 pageId', () => {
        const store: TLSnapshotStore = {}
        const pageId = ensurePageScaffold(store)
        expect(pageId).toBe('page:page')
        expect(store['document:document']).toMatchObject({ typeName: 'document', gridSize: 10 })
        expect(store['page:page']).toMatchObject({ typeName: 'page', index: 'a1' })
    })

    it('已有 page 時沿用其 id，不覆蓋', () => {
        const store: TLSnapshotStore = {
            'page:abc': { typeName: 'page', id: 'page:abc', name: 'X', index: 'a5', meta: {} },
        }
        const pageId = ensurePageScaffold(store)
        expect(pageId).toBe('page:abc')
        expect(store['page:abc'].name).toBe('X')        // 未被覆蓋
        expect(store['page:abc'].index).toBe('a5')
        expect(store['page:page']).toBeUndefined()       // 不另建預設 page
    })

    it('已有 document 時不覆蓋', () => {
        const store: TLSnapshotStore = {
            'document:document': { typeName: 'document', id: 'document:document', gridSize: 99, name: 'keep', meta: {} },
        }
        ensurePageScaffold(store)
        expect(store['document:document'].gridSize).toBe(99)
        expect(store['document:document'].name).toBe('keep')
    })
})

describe('nextAppendX', () => {
    it('無 shape 時回傳 100', () => {
        expect(nextAppendX({})).toBe(100)
    })

    it('回傳最右側 shape 右緣 +40', () => {
        const store: TLSnapshotStore = {
            a: shape('a', 0, 240),     // 右緣 240
            b: shape('b', 300, 100),   // 右緣 400 ← 最右
        }
        expect(nextAppendX(store)).toBe(440)
    })

    it('缺 x/w 時以預設 0/240 計算', () => {
        const store: TLSnapshotStore = {
            a: { typeName: 'shape', id: 'a', type: 'card' },  // x?, w? 皆缺
        }
        expect(nextAppendX(store)).toBe(280)   // (0 + 240) + 40
    })

    it('忽略非 shape 記錄', () => {
        const store: TLSnapshotStore = {
            'page:page': { typeName: 'page', id: 'page:page' },
            a: shape('a', 0, 240),
        }
        expect(nextAppendX(store)).toBe(280)
    })
})

describe('lastShapeIndex', () => {
    it('無 shape 時回傳 a0', () => {
        expect(lastShapeIndex({})).toBe('a0')
    })

    it('回傳排序後最大的 index', () => {
        const store: TLSnapshotStore = {
            a: shape('a', 0, 240, 'a1'),
            b: shape('b', 0, 240, 'a3'),
            c: shape('c', 0, 240, 'a2'),
        }
        expect(lastShapeIndex(store)).toBe('a3')
    })

    it('忽略無 index 的 shape', () => {
        const store: TLSnapshotStore = {
            a: shape('a', 0, 240, 'a2'),
            b: shape('b', 0, 240),   // 無 index
        }
        expect(lastShapeIndex(store)).toBe('a2')
    })
})

describe('gridLayout', () => {
    it('空批次回傳空陣列', () => {
        expect(gridLayout([], 100, 100)).toEqual([])
    })

    it('4 張 → 2 欄（ceil√4）網格，欄步/列步 = 最大尺寸 + gap', () => {
        const cards = Array.from({ length: 4 }, () => ({ w: 240, h: 180 }))
        // cols=2, colStep=280, rowStep=220，錨點 (100,100)
        expect(gridLayout(cards, 100, 100)).toEqual([
            { x: 100, y: 100 }, { x: 380, y: 100 },
            { x: 100, y: 320 }, { x: 380, y: 320 },
        ])
    })

    it('欄步/列步取批次中最大卡片尺寸（不重疊）', () => {
        const cards = [{ w: 240, h: 180 }, { w: 400, h: 300 }, { w: 240, h: 180 }]
        // n=3 → cols=2；colStep=400+40=440、rowStep=300+40=340
        expect(gridLayout(cards, 0, 0)).toEqual([
            { x: 0, y: 0 }, { x: 440, y: 0 },
            { x: 0, y: 340 },
        ])
    })

    it('尊重自訂 gap 與起點', () => {
        const cards = [{ w: 100, h: 100 }, { w: 100, h: 100 }]
        expect(gridLayout(cards, 50, 60, 10)).toEqual([
            { x: 50, y: 60 }, { x: 160, y: 60 },   // cols=2 → 同列
        ])
    })
})

describe('nextGridSlot', () => {
    const shapeAt = (id: string): TLSnapshotStore[string] => ({ typeName: 'shape', id, type: 'card' })

    it('空 store → 第一格 (100,100)', () => {
        expect(nextGridSlot({})).toEqual({ x: 100, y: 100 })
    })

    it('依現有 shape 數量落於 5 欄網格的下一格', () => {
        const store: TLSnapshotStore = {}
        for (let i = 0; i < 5; i++) store[`s${i}`] = shapeAt(`s${i}`)
        // 已有 5 張 → 第 6 張換到下一列第一欄
        expect(nextGridSlot(store)).toEqual({ x: 100, y: 100 + 220 })
    })

    it('同一列內往右遞增（cellW=280）', () => {
        const store: TLSnapshotStore = { a: shapeAt('a'), b: shapeAt('b') }
        expect(nextGridSlot(store)).toEqual({ x: 100 + 2 * 280, y: 100 })
    })

    it('忽略非 shape 記錄計數', () => {
        const store: TLSnapshotStore = {
            'page:page': { typeName: 'page', id: 'page:page' },
            'document:document': { typeName: 'document', id: 'document:document' },
            a: shapeAt('a'),
        }
        // 只 1 張 shape → 下一格為第 2 欄
        expect(nextGridSlot(store)).toEqual({ x: 100 + 280, y: 100 })
    })
})
