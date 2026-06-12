// src/utils/snapshotCards.test.ts
import { describe, it, expect } from 'vitest'
import { ensurePageScaffold, nextAppendX, lastShapeIndex } from './snapshotCards'
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
