// src/utils/tagManager.test.ts
import { describe, it, expect } from 'vitest'
import type { TLEditorSnapshot } from 'tldraw'
import type { BoardRecord } from '../db'
import { normalizeTagName, validateTagName, collectTagStats, rewriteTagInBoards } from './tagManager'
import { getSnapshotStore, type TLSnapshotStore } from './snapshot'

const snap = (store: TLSnapshotStore): TLEditorSnapshot =>
    ({ document: { store, schema: { schemaVersion: 2, sequences: {} } }, session: {} }) as unknown as TLEditorSnapshot

// tags 用 unknown：需要測「非陣列的髒資料」，故繞過 SnapshotShapeProps 的型別
const card = (id: string, tags: unknown): TLSnapshotStore[string] => ({
    typeName: 'shape', id, type: 'card', x: 0, y: 0, index: 'a1',
    props: { type: 'text', text: '', tags } as TLSnapshotStore[string]['props'],
})

const board = (id: string, store: TLSnapshotStore): BoardRecord => ({
    id, name: id, snapshot: snap(store), thumbnail: null, updatedAt: 1,
})

/** 取某板某卡目前的 tags，驗證改寫結果 */
const tagsOf = (b: BoardRecord, shapeId: string) =>
    getSnapshotStore(b.snapshot!)[shapeId].props?.tags

describe('normalizeTagName', () => {
    it('去頭尾空白與開頭的 #', () => {
        expect(normalizeTagName('  #工作 ')).toBe('工作')
        expect(normalizeTagName('##a')).toBe('a')
        expect(normalizeTagName('工作')).toBe('工作')
    })
})

describe('validateTagName', () => {
    it('合法名稱回傳 null', () => {
        expect(validateTagName('新名字', '舊名字')).toBeNull()
        expect(validateTagName('#新名字', '舊名字')).toBeNull()
    })

    it('空白名稱不接受', () => {
        expect(validateTagName('   ', 'a')).toBe('標籤名稱不能是空的')
        expect(validateTagName('#', 'a')).toBe('標籤名稱不能是空的')
    })

    it('與原名相同視為沒變更', () => {
        expect(validateTagName('a', 'a')).toBe('名稱沒有變更')
        expect(validateTagName(' #a ', 'a')).toBe('名稱沒有變更')
    })

    it('不接受含空白或過長的名稱', () => {
        expect(validateTagName('a b', 'x')).toBe('標籤名稱不能有空白')
        expect(validateTagName('a'.repeat(31), 'x')).toBe('標籤名稱請控制在 30 字以內')
    })
})

describe('collectTagStats', () => {
    it('無標籤時回傳空陣列', () => {
        expect(collectTagStats([board('b1', { 'shape:a': card('shape:a', []) })])).toEqual([])
    })

    it('跨白板統計張數與白板數，依張數排序', () => {
        const boards = [
            board('b1', { 'shape:a': card('shape:a', ['工作', '急']), 'shape:b': card('shape:b', ['工作']) }),
            board('b2', { 'shape:c': card('shape:c', ['工作']) }),
        ]
        expect(collectTagStats(boards)).toEqual([
            { tag: '工作', count: 3, boardIds: ['b1', 'b2'] },
            { tag: '急', count: 1, boardIds: ['b1'] },
        ])
    })

    it('同張數時依名稱排序', () => {
        const boards = [board('b1', { 'shape:a': card('shape:a', ['b', 'a']) })]
        expect(collectTagStats(boards).map(s => s.tag)).toEqual(['a', 'b'])
    })

    it('同一張卡重複列同一 tag 只算一次', () => {
        const boards = [board('b1', { 'shape:a': card('shape:a', ['x', 'x']) })]
        expect(collectTagStats(boards)[0].count).toBe(1)
    })

    it('忽略 null snapshot、非 card shape 與非陣列 tags', () => {
        const boards: BoardRecord[] = [
            { id: 'b0', name: 'b0', snapshot: null, thumbnail: null, updatedAt: 1 },
            board('b1', {
                'shape:draw': { typeName: 'shape', id: 'shape:draw', type: 'draw', props: { tags: ['忽略'] } },
                'shape:bad': card('shape:bad', 'notarray'),
                'shape:ok': card('shape:ok', ['留下']),
            }),
        ]
        expect(collectTagStats(boards).map(s => s.tag)).toEqual(['留下'])
    })
})

describe('rewriteTagInBoards', () => {
    it('改名：只回傳有變動的白板', () => {
        const boards = [
            board('b1', { 'shape:a': card('shape:a', ['舊', '其他']) }),
            board('b2', { 'shape:b': card('shape:b', ['無關']) }),
        ]
        const { changedBoards, updates } = rewriteTagInBoards(boards, '舊', '新')
        expect(changedBoards.map(b => b.id)).toEqual(['b1'])
        expect(tagsOf(changedBoards[0], 'shape:a')).toEqual(['新', '其他'])
        expect(updates).toEqual([{ boardId: 'b1', shapeId: 'shape:a', tags: ['新', '其他'] }])
    })

    it('沒有任何卡片用到該標籤時不回傳變動', () => {
        const boards = [board('b1', { 'shape:a': card('shape:a', ['x']) })]
        expect(rewriteTagInBoards(boards, '不存在', '新')).toEqual({ changedBoards: [], updates: [] })
    })

    it('合併到既有標籤時去重、保留原順序', () => {
        const boards = [board('b1', { 'shape:a': card('shape:a', ['a', 'b', 'c']) })]
        const { changedBoards } = rewriteTagInBoards(boards, 'a', 'b')
        expect(tagsOf(changedBoards[0], 'shape:a')).toEqual(['b', 'c'])
    })

    it('刪除（to 為 null）移除該標籤', () => {
        const boards = [board('b1', { 'shape:a': card('shape:a', ['a', 'b']) })]
        const { changedBoards } = rewriteTagInBoards(boards, 'a', null)
        expect(tagsOf(changedBoards[0], 'shape:a')).toEqual(['b'])
    })

    it('不 mutate 傳入的 boards', () => {
        const boards = [board('b1', { 'shape:a': card('shape:a', ['舊']) })]
        rewriteTagInBoards(boards, '舊', '新')
        expect(tagsOf(boards[0], 'shape:a')).toEqual(['舊'])
    })

    it('同一板多張卡都改到，且更新 updatedAt', () => {
        const boards = [board('b1', {
            'shape:a': card('shape:a', ['舊']),
            'shape:b': card('shape:b', ['舊']),
            'shape:c': card('shape:c', ['別的']),
        })]
        const { changedBoards, updates } = rewriteTagInBoards(boards, '舊', '新')
        expect(updates.map(u => u.shapeId)).toEqual(['shape:a', 'shape:b'])
        expect(tagsOf(changedBoards[0], 'shape:c')).toEqual(['別的'])
        expect(changedBoards[0].updatedAt).toBeGreaterThan(1)
    })
})
