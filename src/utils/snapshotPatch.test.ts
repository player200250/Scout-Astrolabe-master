// src/utils/snapshotPatch.test.ts
import { describe, it, expect } from 'vitest'
import type { TLEditorSnapshot } from 'tldraw'
import { getSnapshotStore } from './snapshot'
import {
    toggleTodo, setCardText, setCardStatus, setCardPriority, plainTextToHtml,
} from './snapshotPatch'

function snap(shapes: Record<string, Record<string, unknown>>): TLEditorSnapshot {
    const store: Record<string, unknown> = {
        'page:page': { typeName: 'page', id: 'page:page', name: 'Page 1' },
    }
    for (const [id, props] of Object.entries(shapes)) {
        store[id] = { typeName: 'shape', id, type: 'card', parentId: 'page:page', index: 'a1', props }
    }
    return { document: { store, schema: { schemaVersion: 2, sequences: {} } }, session: {} } as unknown as TLEditorSnapshot
}

const props = (s: TLEditorSnapshot, id: string) =>
    getSnapshotStore(s)[id]?.props as Record<string, unknown>

describe('toggleTodo', () => {
    const base = snap({
        'shape:t': {
            type: 'todo',
            todos: [
                { id: 'a', text: '第一項', checked: false },
                { id: 'b', text: '第二項', checked: false },
            ],
        },
    })

    it('依 id 勾中正確的那一項', () => {
        const next = toggleTodo(base, 'shape:t', 'b', true)
        expect(props(next, 'shape:t').todos).toEqual([
            { id: 'a', text: '第一項', checked: false },
            { id: 'b', text: '第二項', checked: true },
        ])
    })

    it('可以取消勾選', () => {
        const on = toggleTodo(base, 'shape:t', 'a', true)
        const off = toggleTodo(on, 'shape:t', 'a', false)
        expect((props(off, 'shape:t').todos as { checked: boolean }[])[0].checked).toBe(false)
    })

    // ⚠️ 不 mutate 是手機合併的前提：合併要拿「改之前」與「改之後」比對，
    // 就地改掉的話 base 會跟著變，永遠算不出本機動過什麼。
    it('不會改到原本那份 snapshot', () => {
        toggleTodo(base, 'shape:t', 'a', true)
        expect((props(base, 'shape:t').todos as { checked: boolean }[])[0].checked).toBe(false)
    })

    it('找不到 todoId 時原樣回傳（不會造出一筆新的）', () => {
        expect(toggleTodo(base, 'shape:t', '不存在', true)).toBe(base)
    })

    it('找不到卡片時原樣回傳', () => {
        expect(toggleTodo(base, 'shape:沒有這張', 'a', true)).toBe(base)
    })

    it('那張卡沒有 todos 欄位時原樣回傳', () => {
        const s = snap({ 'shape:x': { type: 'text', text: 'hi' } })
        expect(toggleTodo(s, 'shape:x', 'a', true)).toBe(s)
    })
})

describe('plainTextToHtml', () => {
    // props.text 的約定一直是 HTML；直接塞純文字進去的話，桌機用 TipTap 讀它
    // 會把整段當一行，換行全部消失
    it('每一行包成一個 <p>', () => {
        expect(plainTextToHtml('第一行\n第二行')).toBe('<p>第一行</p><p>第二行</p>')
    })

    it('跳脫掉 HTML 特殊字元（不讓使用者打的字變成標籤）', () => {
        expect(plainTextToHtml('<script>alert(1)</script>'))
            .toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    })

    it('& 也要跳脫，而且只跳一次', () => {
        expect(plainTextToHtml('a & b')).toBe('<p>a &amp; b</p>')
    })

    it('全空白回空字串', () => {
        expect(plainTextToHtml('   \n  ')).toBe('')
    })
})

describe('setCardText', () => {
    const base = snap({ 'shape:a': { type: 'text', text: '<p>舊的</p>' } })

    it('換掉內容並包成 HTML', () => {
        const next = setCardText(base, 'shape:a', '新的內容')
        expect(props(next, 'shape:a').text).toBe('<p>新的內容</p>')
    })

    it('其餘欄位不動', () => {
        const s = snap({ 'shape:a': { type: 'text', text: 'x', color: 'blue', tags: ['t'] } })
        const next = setCardText(s, 'shape:a', 'y')
        expect(props(next, 'shape:a').color).toBe('blue')
        expect(props(next, 'shape:a').tags).toEqual(['t'])
    })

    it('不會改到原本那份', () => {
        setCardText(base, 'shape:a', '新的')
        expect(props(base, 'shape:a').text).toBe('<p>舊的</p>')
    })

    it('其他卡片原封不動（同一個 store 裡的鄰居不受影響）', () => {
        const s = snap({ 'shape:a': { type: 'text', text: 'A' }, 'shape:b': { type: 'text', text: 'B' } })
        const next = setCardText(s, 'shape:a', '改了')
        expect(props(next, 'shape:b').text).toBe('B')
    })
})

describe('setCardStatus / setCardPriority', () => {
    const base = snap({ 'shape:a': { type: 'text', text: 'x' } })

    it('設定狀態', () => {
        expect(props(setCardStatus(base, 'shape:a', 'done'), 'shape:a').cardStatus).toBe('done')
    })

    it('設定優先級', () => {
        expect(props(setCardPriority(base, 'shape:a', 'high'), 'shape:a').priority).toBe('high')
    })

    it('找不到卡片時原樣回傳', () => {
        expect(setCardStatus(base, 'shape:無', 'done')).toBe(base)
    })
})
