// src/utils/snapshot.test.ts
import { describe, it, expect } from 'vitest'
import type { TLEditorSnapshot } from 'tldraw'
import {
    sanitizeCardProps, getSnapshotStore, withUpdatedStore, toMutableSnapshot,
    getCardShapes, sanitizePageRecords, sanitizeDocumentRecord, sanitizeSnapshot,
    type TLSnapshotStore, type TLSnapshotStoreRecord,
} from './snapshot'

// 把一組 store records 包成 snapshot 形狀。
function snap(store: Record<string, Partial<TLSnapshotStoreRecord>>): TLEditorSnapshot {
    return { document: { store, schema: { schemaVersion: 2, sequences: {} } }, session: {} } as unknown as TLEditorSnapshot
}

describe('sanitizeCardProps', () => {
    it('空物件會補滿所有預設欄位', () => {
        const result = sanitizeCardProps({})
        expect(result.text).toBe('')
        expect(result.todos).toEqual([])
        expect(result.w).toBe(240)
        expect(result.h).toBe(120)
        expect(result.color).toBe('none')
        expect(result.cardStatus).toBe('none')
        expect(result.linkedBoardId).toBeNull()
        // 預設表共 15 個欄位
        expect(Object.keys(result)).toHaveLength(15)
    })

    it('值為 undefined 的已知欄位換成對應預設值', () => {
        const result = sanitizeCardProps({ text: undefined, w: undefined })
        expect(result.text).toBe('')
        expect(result.w).toBe(240)
    })

    it('值為 undefined 但不在預設表的欄位補成 null', () => {
        const result = sanitizeCardProps({ text: 'hi', custom: undefined } as never)
        expect((result as Record<string, unknown>).custom).toBeNull()
    })

    it('既有有效值不會被預設值覆蓋', () => {
        const result = sanitizeCardProps({ w: 500, text: '自訂內容' })
        expect(result.w).toBe(500)
        expect(result.text).toBe('自訂內容')
    })

    it('已完整的物件回傳「同一個 reference」（沒有改動）', () => {
        // 先做一個已補滿的完整物件
        const full = sanitizeCardProps({})
        // 再丟回去 sanitize，應原封不動回傳同一個物件
        const again = sanitizeCardProps(full)
        expect(again).toBe(full) // toBe = 同一個 reference
    })

    it('有改動時回傳「新物件」，不汙染原本的 props', () => {
        const original = { text: 'hi' }
        const result = sanitizeCardProps(original)
        expect(result).not.toBe(original)        // 不是同一個 reference
        expect(original).toEqual({ text: 'hi' }) // 原物件未被修改
    })
})

describe('getSnapshotStore', () => {
    it('回傳 document.store', () => {
        const store = { 'shape:a': { typeName: 'shape', id: 'shape:a' } }
        expect(getSnapshotStore(snap(store))).toBe(store)
    })

    it('缺少 document 時回傳空物件', () => {
        expect(getSnapshotStore({} as TLEditorSnapshot)).toEqual({})
    })
})

describe('withUpdatedStore', () => {
    it('回傳換掉 store 的新 snapshot，且不汙染原 snapshot', () => {
        const original = snap({ 'shape:a': { typeName: 'shape', id: 'shape:a' } })
        const newStore: TLSnapshotStore = { 'shape:b': { typeName: 'shape', id: 'shape:b' } }
        const result = withUpdatedStore(original, newStore)

        expect(getSnapshotStore(result)).toBe(newStore)        // 新 store 已套上
        expect(result).not.toBe(original)                       // 是新物件
        expect(Object.keys(getSnapshotStore(original))).toEqual(['shape:a']) // 原 snapshot 未變
    })
})

describe('toMutableSnapshot', () => {
    it('傳 null 回傳一個空的可變 snapshot 骨架', () => {
        const m = toMutableSnapshot(null)
        expect(m.document.store).toEqual({})
        expect(m.document.schema.schemaVersion).toBe(2)
        expect(m.session).toEqual({})
    })

    it('深拷貝既有 snapshot：改動 clone 不影響原物件', () => {
        const original = snap({ 'shape:a': { typeName: 'shape', id: 'shape:a' } })
        const m = toMutableSnapshot(original)
        m.document.store['shape:new'] = { typeName: 'shape', id: 'shape:new' }

        // clone 多了一筆，原 snapshot 仍只有一筆
        expect(Object.keys(m.document.store)).toHaveLength(2)
        expect(Object.keys(getSnapshotStore(original))).toEqual(['shape:a'])
    })

    it('缺 document/store 的 snapshot 會被補齊', () => {
        const m = toMutableSnapshot({} as TLEditorSnapshot)
        expect(m.document.store).toEqual({})
    })
})

describe('getCardShapes', () => {
    it('null snapshot 回空陣列', () => {
        expect(getCardShapes(null)).toEqual([])
    })

    it('只挑出 card shape，並帶出 id/x/y/props', () => {
        const s = snap({
            'shape:c': { typeName: 'shape', type: 'card', id: 'shape:c', x: 5, y: 7, props: { type: 'text' } },
            'shape:f': { typeName: 'shape', type: 'frame', id: 'shape:f' }, // 非 card → 排除
            'page:1': { typeName: 'page', id: 'page:1' },                   // 非 shape → 排除
        })
        const cards = getCardShapes(s)
        expect(cards).toHaveLength(1)
        expect(cards[0]).toEqual({ id: 'shape:c', x: 5, y: 7, props: { type: 'text' } })
    })

    it('缺 x/y/props 時補成 0 / 0 / {}', () => {
        const s = snap({ 'shape:c': { typeName: 'shape', type: 'card', id: 'shape:c' } })
        expect(getCardShapes(s)[0]).toEqual({ id: 'shape:c', x: 0, y: 0, props: {} })
    })
})

describe('sanitizePageRecords', () => {
    it('page 缺 name/index/meta 時補齊', () => {
        const s = snap({ 'page:1': { typeName: 'page', id: 'page:1' } })
        const result = sanitizePageRecords(s)
        const page = getSnapshotStore(result)['page:1']
        expect(page.name).toBe('')
        expect(page.index).toBe('a1')
        expect(page.meta).toEqual({})
    })

    it('所有 page 都完整時回傳同一個 reference（未改動）', () => {
        const s = snap({ 'page:1': { typeName: 'page', id: 'page:1', name: '頁', index: 'a2', meta: {} } })
        expect(sanitizePageRecords(s)).toBe(s)
    })

    it('保留 page 原有欄位，只補缺的（已存在的 name 不被覆蓋）', () => {
        const s = snap({ 'page:1': { typeName: 'page', id: 'page:1', name: '原名' } })
        const page = getSnapshotStore(sanitizePageRecords(s))['page:1']
        expect(page.name).toBe('原名')   // 既有值保留
        expect(page.index).toBe('a1')    // 缺的補上
    })
})

describe('sanitizeDocumentRecord', () => {
    it('document:document 缺 gridSize/name 時補齊', () => {
        const s = snap({ 'document:document': { typeName: 'document', id: 'document:document' } })
        const doc = getSnapshotStore(sanitizeDocumentRecord(s))['document:document']
        expect(doc.gridSize).toBe(10)
        expect(doc.name).toBe('')
    })

    it('沒有 document:document 時回傳同一個 reference', () => {
        const s = snap({ 'shape:a': { typeName: 'shape', id: 'shape:a' } })
        expect(sanitizeDocumentRecord(s)).toBe(s)
    })

    it('document 已完整時回傳同一個 reference', () => {
        const s = snap({ 'document:document': { typeName: 'document', id: 'document:document', gridSize: 10, name: '' } })
        expect(sanitizeDocumentRecord(s)).toBe(s)
    })
})

describe('sanitizeSnapshot', () => {
    it('frame shape 缺 props 時補上 frame 預設', () => {
        const s = snap({ 'shape:f': { typeName: 'shape', type: 'frame', id: 'shape:f' } })
        const frame = getSnapshotStore(sanitizeSnapshot(s))['shape:f']
        expect(frame.props).toMatchObject({ name: '', w: 320, h: 240 })
    })

    it('arrow shape 缺 props 時補上 arrow 預設', () => {
        const s = snap({ 'shape:ar': { typeName: 'shape', type: 'arrow', id: 'shape:ar' } })
        const arrow = getSnapshotStore(sanitizeSnapshot(s))['shape:ar']
        expect(arrow.props).toMatchObject({ dash: 'draw', arrowheadEnd: 'arrow' })
    })

    it('card shape 不受 frame/arrow 補值影響', () => {
        const s = snap({ 'shape:c': { typeName: 'shape', type: 'card', id: 'shape:c', props: { type: 'text' } } })
        const card = getSnapshotStore(sanitizeSnapshot(s))['shape:c']
        expect(card.props).toEqual({ type: 'text' }) // 沒被塞 frame/arrow 預設
    })
})
