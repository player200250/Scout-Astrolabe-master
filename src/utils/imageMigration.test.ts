import { describe, it, expect } from 'vitest'
import type { TLEditorSnapshot } from 'tldraw'
import { findMigratableImageShapes, applyImageMigrations } from './imageMigration'

// 建構最小 snapshot：store 由傳入的 shape 記錄組成
function makeSnapshot(records: Record<string, unknown>): TLEditorSnapshot {
    return {
        document: { store: records, schema: { schemaVersion: 2, sequences: {} } },
        session: {},
    } as unknown as TLEditorSnapshot
}

const imageCard = (id: string, props: Record<string, unknown>) => ({
    typeName: 'shape', id, type: 'card', props: { type: 'image', ...props },
})

describe('findMigratableImageShapes', () => {
    it('null snapshot 回空陣列', () => {
        expect(findMigratableImageShapes(null)).toEqual([])
    })

    it('base64 image 卡且無 storedName → 列為待遷移', () => {
        const snap = makeSnapshot({
            'shape:a': imageCard('shape:a', { image: 'data:image/png;base64,AAAA' }),
        })
        expect(findMigratableImageShapes(snap)).toEqual([{ shapeId: 'shape:a', dataUrl: 'data:image/png;base64,AAAA' }])
    })

    it('已有 storedName → 不遷移（冪等）', () => {
        const snap = makeSnapshot({
            'shape:a': imageCard('shape:a', { image: null, storedName: 'uuid.png' }),
        })
        expect(findMigratableImageShapes(snap)).toEqual([])
    })

    it('遠端 http URL → 不遷移（無法存檔）', () => {
        const snap = makeSnapshot({
            'shape:a': imageCard('shape:a', { image: 'https://example.com/x.png' }),
        })
        expect(findMigratableImageShapes(snap)).toEqual([])
    })

    it('link 卡的 image（遠端縮圖）不被誤判', () => {
        const snap = makeSnapshot({
            'shape:l': { typeName: 'shape', id: 'shape:l', type: 'card', props: { type: 'link', image: 'data:image/png;base64,BBBB' } },
        })
        // link 卡即使 image 是 data URL 也不算 image 卡，type 收斂排除
        expect(findMigratableImageShapes(snap)).toEqual([])
    })

    it('非 shape 記錄被略過', () => {
        const snap = makeSnapshot({
            'page:1': { typeName: 'page', id: 'page:1' },
        })
        expect(findMigratableImageShapes(snap)).toEqual([])
    })
})

describe('applyImageMigrations', () => {
    it('把對應 shape 的 image 清 null、寫入 storedName', () => {
        const snap = makeSnapshot({
            'shape:a': imageCard('shape:a', { image: 'data:image/png;base64,AAAA', w: 280 }),
            'shape:b': imageCard('shape:b', { image: 'data:image/png;base64,CCCC' }),
        })
        const out = applyImageMigrations(snap, [{ shapeId: 'shape:a', storedName: 'uuid-a.png' }])
        const store = (out as unknown as { document: { store: Record<string, { props: Record<string, unknown> }> } }).document.store
        expect(store['shape:a'].props.image).toBeNull()
        expect(store['shape:a'].props.storedName).toBe('uuid-a.png')
        expect(store['shape:a'].props.w).toBe(280) // 其他欄位保留
        expect(store['shape:b'].props.image).toBe('data:image/png;base64,CCCC') // 未指定的不動
    })

    it('空遷移清單 → 回原 snapshot（同參考）', () => {
        const snap = makeSnapshot({ 'shape:a': imageCard('shape:a', { image: 'data:x' }) })
        expect(applyImageMigrations(snap, [])).toBe(snap)
    })

    it('shapeId 不存在時安全略過', () => {
        const snap = makeSnapshot({ 'shape:a': imageCard('shape:a', { image: 'data:x' }) })
        const out = applyImageMigrations(snap, [{ shapeId: 'shape:zzz', storedName: 'n.png' }])
        const store = (out as unknown as { document: { store: Record<string, unknown> } }).document.store
        expect(store['shape:zzz']).toBeUndefined()
    })
})
