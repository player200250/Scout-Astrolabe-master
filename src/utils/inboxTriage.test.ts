// @vitest-environment jsdom
// src/utils/inboxTriage.test.ts
//
// triagePreview 經 splitTitleBody/stripHtml 用到 DOMParser，需 jsdom 環境。
import { describe, it, expect } from 'vitest'
import type { TLEditorSnapshot } from 'tldraw'
import {
    triagePreview, buildTriageQueue, nextCursor, prevCursor,
    triageProgress, summarizeDecisions, type TriageDecision,
} from './inboxTriage'
import type { TLSnapshotStore } from './snapshot'

const snap = (store: TLSnapshotStore): TLEditorSnapshot =>
    ({ document: { store, schema: { schemaVersion: 2, sequences: {} } }, session: {} }) as unknown as TLEditorSnapshot

const card = (id: string, index: string, props: Record<string, unknown>): TLSnapshotStore[string] => ({
    typeName: 'shape', id, type: 'card', x: 0, y: 0, index, props,
})

describe('triagePreview', () => {
    it('文字卡拆出 H1 標題與內文', () => {
        expect(triagePreview({ type: 'text', text: '<h1>標題</h1><p>內文</p>' }))
            .toEqual({ title: '標題', preview: '內文' })
    })

    it('無標題的文字卡 title 為 null', () => {
        expect(triagePreview({ type: 'text', text: '<p>只有內文</p>' }))
            .toEqual({ title: null, preview: '只有內文' })
    })

    it('todo 卡標題顯示完成比例，內文列出項目', () => {
        const r = triagePreview({
            type: 'todo',
            todos: [{ text: 'a', checked: true }, { text: 'b', checked: false }],
        })
        expect(r.title).toBe('待辦（1/2）')
        expect(r.preview).toBe('☑ a\n☐ b')
    })

    it('todo 卡最多列 6 項', () => {
        const todos = Array.from({ length: 10 }, (_, i) => ({ text: `t${i}`, checked: false }))
        expect(triagePreview({ type: 'todo', todos }).preview.split('\n')).toHaveLength(6)
    })

    it('空 todo 卡不炸', () => {
        expect(triagePreview({ type: 'todo' })).toEqual({ title: '待辦（0/0）', preview: '' })
    })

    it('連結卡取 title 與 url', () => {
        expect(triagePreview({ type: 'link', title: 'Anthropic', url: 'https://x.dev' }))
            .toEqual({ title: 'Anthropic', preview: 'https://x.dev' })
    })

    it('檔案/圖片/白板卡給型別化描述', () => {
        expect(triagePreview({ type: 'file', originalName: 'a.pdf' }).title).toBe('a.pdf')
        expect(triagePreview({ type: 'image' }).title).toBe('圖片')
        expect(triagePreview({ type: 'board', text: '<p>子板</p>' }).title).toBe('白板卡：子板')
    })
})

describe('buildTriageQueue', () => {
    it('null snapshot 回傳空佇列', () => {
        expect(buildTriageQueue(null)).toEqual([])
    })

    it('依 fractional index 排序（最舊的先）', () => {
        const s = snap({
            'shape:c': card('shape:c', 'a3', { type: 'text', text: 'c' }),
            'shape:a': card('shape:a', 'a1', { type: 'text', text: 'a' }),
            'shape:b': card('shape:b', 'a2', { type: 'text', text: 'b' }),
        })
        expect(buildTriageQueue(s).map(i => i.shapeId)).toEqual(['shape:a', 'shape:b', 'shape:c'])
    })

    it('只取 card shape，忽略其他記錄與非 card shape', () => {
        const s = snap({
            'page:page': { typeName: 'page', id: 'page:page', index: 'a1' },
            'shape:draw': { typeName: 'shape', id: 'shape:draw', type: 'draw', index: 'a1', props: {} },
            'shape:card': card('shape:card', 'a2', { type: 'text', text: 'x' }),
        })
        expect(buildTriageQueue(s).map(i => i.shapeId)).toEqual(['shape:card'])
    })

    it('帶出 tags/status/priority，缺欄位時給預設值', () => {
        const s = snap({
            'shape:a': card('shape:a', 'a1', { type: 'text', text: 'x', tags: ['工作'], cardStatus: 'todo', priority: 'high' }),
            'shape:b': card('shape:b', 'a2', { type: 'text', text: 'y' }),
        })
        const [a, b] = buildTriageQueue(s)
        expect(a).toMatchObject({ tags: ['工作'], cardStatus: 'todo', priority: 'high' })
        expect(b).toMatchObject({ tags: [], cardStatus: 'none', priority: 'none' })
    })

    it('tags 非陣列時退回空陣列', () => {
        const s = snap({ 'shape:a': card('shape:a', 'a1', { type: 'text', text: 'x', tags: null }) })
        expect(buildTriageQueue(s)[0].tags).toEqual([])
    })
})

describe('nextCursor / prevCursor', () => {
    it('前進不超過 total（total ＝ 完成畫面）', () => {
        expect(nextCursor(0, 3)).toBe(1)
        expect(nextCursor(2, 3)).toBe(3)
        expect(nextCursor(3, 3)).toBe(3)
    })

    it('後退不小於 0', () => {
        expect(prevCursor(2)).toBe(1)
        expect(prevCursor(0)).toBe(0)
    })
})

describe('triageProgress', () => {
    it('空佇列視為已完成', () => {
        expect(triageProgress(0, 0)).toEqual({ current: 0, total: 0, percent: 100 })
    })

    it('current 為 1-based，percent 依已處理張數計算', () => {
        expect(triageProgress(0, 4)).toEqual({ current: 1, total: 4, percent: 0 })
        expect(triageProgress(2, 4)).toEqual({ current: 3, total: 4, percent: 50 })
    })

    it('游標到底時 current 不超過 total，percent 為 100', () => {
        expect(triageProgress(4, 4)).toEqual({ current: 4, total: 4, percent: 100 })
    })
})

describe('summarizeDecisions', () => {
    it('無決策時全為 0', () => {
        expect(summarizeDecisions({})).toEqual({ moved: 0, task: 0, kept: 0, deleted: 0 })
    })

    it('依決策分類計數', () => {
        const decisions: Record<string, TriageDecision> = {
            a: 'moved', b: 'moved', c: 'task', d: 'deleted',
        }
        expect(summarizeDecisions(decisions)).toEqual({ moved: 2, task: 1, kept: 0, deleted: 1 })
    })
})
