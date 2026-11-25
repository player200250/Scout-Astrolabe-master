// @vitest-environment jsdom
// src/hooks/useBoardAutosave.test.ts
//
// P0 修復 2：白板存檔生命週期。用假的 store（只需要 listen）＋ fake timers 驗 debounce 與卸載補存；
// 「切板＋重新載入」那條用 fake-indexeddb 跑真的 Dexie（隔離資料庫）。
import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { TLEditorSnapshot } from 'tldraw'
import { useBoardAutosave, AUTOSAVE_DEBOUNCE_MS, type AutosaveStore } from './useBoardAutosave'
import { emitAppEvent } from '../utils/appEvents'
import { db, type BoardRecord } from '../db'
import { saveBoard } from '../utils/boardDb'

/** 假 store：content 代表白板內容，change() 模擬一次使用者編輯 */
function fakeStore() {
    const listeners = new Set<() => void>()
    const state = { content: 'v0' }
    const store: AutosaveStore = {
        listen: (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    }
    return {
        store,
        state,
        change(content: string) { state.content = content; listeners.forEach(l => l()) },
        getSnapshot: () => ({ content: state.content }) as unknown as TLEditorSnapshot,
    }
}
const contentOf = (snap: unknown) => (snap as { content: string }).content

function mount(boardId: string, f = fakeStore(), extra: Partial<Parameters<typeof useBoardAutosave>[0]> = {}) {
    const onSave = vi.fn()
    const view = renderHook(
        ({ id }) => useBoardAutosave({ store: f.store, boardId: id, getSnapshot: f.getSnapshot, onSave, ...extra }),
        { initialProps: { id: boardId } },
    )
    return { ...view, onSave, f }
}

describe('useBoardAutosave — debounce', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('快速連續修改只存一次，而且存的是最新狀態', async () => {
        const { onSave, f } = mount('A')
        act(() => { f.change('v1'); f.change('v2'); f.change('v3') })
        expect(onSave).not.toHaveBeenCalled()

        await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS) })

        expect(onSave).toHaveBeenCalledTimes(1)
        expect(contentOf(onSave.mock.calls[0][0])).toBe('v3')
        expect(onSave.mock.calls[0][2]).toBe('A')
    })

    it('debounce 還沒到就不寫（不以高頻寫入代替生命週期管理）', async () => {
        const { onSave, f } = mount('A')
        act(() => { f.change('v1') })
        await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 1) })
        expect(onSave).not.toHaveBeenCalled()
    })
})

describe('useBoardAutosave — 卸載（切換白板）', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('修改後立刻切換白板（卸載）⇒ 立即補存最新內容，並寫進原本那塊板', () => {
        const { onSave, f, unmount } = mount('A')
        act(() => { f.change('v1'); f.change('v2') })

        unmount()

        expect(onSave).toHaveBeenCalledTimes(1)
        expect(contentOf(onSave.mock.calls[0][0])).toBe('v2')
        expect(onSave.mock.calls[0][1]).toBeUndefined()   // 補存不產縮圖
        expect(onSave.mock.calls[0][2]).toBe('A')
    })

    it('補存之後計時器不會再寫一次', async () => {
        const { onSave, f, unmount } = mount('A')
        act(() => { f.change('v1') })
        unmount()
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS * 2)
        expect(onSave).toHaveBeenCalledTimes(1)
    })

    it('沒有待存變更時卸載不寫', async () => {
        const { onSave, f, unmount } = mount('A')
        act(() => { f.change('v1') })
        await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS) })
        onSave.mockClear()

        unmount()

        expect(onSave).not.toHaveBeenCalled()
    })

    it('取 snapshot 失敗（editor 已釋放）⇒ 不崩潰、記錄錯誤、不寫入壞資料', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        const f = fakeStore()
        const { onSave, unmount } = mount('A', f, { getSnapshot: () => { throw new Error('disposed') } })
        act(() => { f.change('v1') })

        expect(() => unmount()).not.toThrow()
        expect(onSave).not.toHaveBeenCalled()
        expect(err).toHaveBeenCalled()
        err.mockRestore()
    })

    it('onSave 丟錯不會讓卸載流程崩潰', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        const f = fakeStore()
        const onSave = vi.fn(() => { throw new Error('boom') })
        const { unmount } = renderHook(() => useBoardAutosave({ store: f.store, boardId: 'A', getSnapshot: f.getSnapshot, onSave }))
        act(() => { f.change('v1') })
        expect(() => unmount()).not.toThrow()
        expect(err).toHaveBeenCalled()
        err.mockRestore()
    })
})

describe('useBoardAutosave — 縮圖與競態', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('等縮圖期間又改又卸載 ⇒ 舊的那次不會在之後把舊內容蓋回去', async () => {
        let resolveThumb!: (v: string) => void
        const getThumbnail = vi.fn(() => new Promise<string>(r => { resolveThumb = r }))
        const f = fakeStore()
        const { onSave, unmount } = mount('A', f, { getThumbnail })

        act(() => { f.change('old') })
        await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS) })   // 開始等縮圖（snapshot=old）
        act(() => { f.change('new') })
        unmount()                                                                               // 補存 new
        await act(async () => { resolveThumb('data:image/png;base64,x'); await Promise.resolve() })

        expect(onSave.mock.calls.map(c => contentOf(c[0]))).toEqual(['new'])
    })

    it('正常情況下縮圖跟 snapshot 一起寫', async () => {
        const f = fakeStore()
        const { onSave } = mount('A', f, { getThumbnail: async () => 'thumb' })
        act(() => { f.change('v1') })
        await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS) })
        expect(onSave).toHaveBeenCalledWith(expect.anything(), 'thumb', 'A')
    })
})

describe('useBoardAutosave — 外部觸發的補存', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('flush-pending-board-save（還原備份前）⇒ 立即寫掉待存變更', () => {
        const { onSave, f } = mount('A')
        act(() => { f.change('v1') })
        act(() => { emitAppEvent('flush-pending-board-save') })
        expect(onSave).toHaveBeenCalledTimes(1)
        expect(contentOf(onSave.mock.calls[0][0])).toBe('v1')
    })

    it('pagehide（關閉視窗／重新載入）⇒ 盡力補存', () => {
        const { onSave, f } = mount('A')
        act(() => { f.change('v1') })
        act(() => { window.dispatchEvent(new Event('pagehide')) })
        expect(onSave).toHaveBeenCalledTimes(1)
    })
})

describe('useBoardAutosave — 切換白板＋重新載入後資料一致（真的 Dexie）', () => {
    const board = (id: string): BoardRecord => ({ id, name: id, snapshot: null, thumbnail: null, updatedAt: 0 })

    beforeEach(async () => { await db.table('boards').clear() })

    it('A 板改完立刻切到 B 板、B 也改完立刻離開 ⇒ 重新讀資料庫，兩塊都是最新內容', async () => {
        await db.table('boards').bulkPut([board('A'), board('B')])
        const writes: Promise<void>[] = []
        const onSave = (snapshot: TLEditorSnapshot, _t: unknown, id: string) => {
            writes.push(saveBoard({ ...board(id), snapshot, updatedAt: Date.now() }))
        }

        const fa = fakeStore()
        const a = renderHook(() => useBoardAutosave({ store: fa.store, boardId: 'A', getSnapshot: fa.getSnapshot, onSave }))
        act(() => { fa.change('A-1'); fa.change('A-2') })
        a.unmount()   // 切到 B（App 以 key={board.id} 重掛白板）

        const fb = fakeStore()
        const b = renderHook(() => useBoardAutosave({ store: fb.store, boardId: 'B', getSnapshot: fb.getSnapshot, onSave }))
        act(() => { fb.change('B-1') })
        b.unmount()

        await Promise.all(writes)
        // 「重新載入」＝丟掉記憶體，直接從資料庫讀
        const reloaded = await db.table('boards').toArray() as BoardRecord[]
        const byId = Object.fromEntries(reloaded.map(r => [r.id, contentOf(r.snapshot)]))
        expect(byId).toEqual({ A: 'A-2', B: 'B-1' })
    })
})

describe('tldraw store 在 editor.dispose() 之後仍可取 snapshot（卸載補存的前提）', () => {
    it('store.dispose() 後 getSnapshot 仍回傳完整文件', async () => {
        const { createTLStore, getSnapshot, defaultShapeUtils, defaultBindingUtils, createShapeId } = await import('tldraw')
        const store = createTLStore({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils })
        ;(store as unknown as { ensureStoreIsUsable: () => void }).ensureStoreIsUsable()   // 內部 API：補齊 document/page 記錄（editor 建立時也會做）
        const before = Object.keys(getSnapshot(store).document.store).length
        const id = createShapeId('x')
        store.put([{
            id, typeName: 'shape', type: 'geo', parentId: 'page:page' as never, index: 'a1' as never,
            x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, meta: {},
            props: (await import('tldraw')).GeoShapeUtil.prototype.getDefaultProps(),
        } as never])
        store.dispose()
        const snap = getSnapshot(store)
        expect(Object.keys(snap.document.store).length).toBe(before + 1)
        expect(snap.document.store[id]).toBeTruthy()
    }, 30_000)   // 動態載入整個 tldraw：單跑約 1 秒，全套平行跑時曾到 9 秒、撞到預設 5 秒上限
})
