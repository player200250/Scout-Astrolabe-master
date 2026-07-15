// src/utils/homeBoardMigration.test.ts
import { describe, it, expect } from 'vitest'
import type { TLEditorSnapshot } from 'tldraw'
import type { BoardRecord } from '../db'
import {
    homeBoardHasContent, buildHomeBoardMigration, MIGRATED_HOME_BOARD_NAME,
} from './homeBoardMigration'
import type { TLSnapshotStore } from './snapshot'

const snap = (store: TLSnapshotStore): TLEditorSnapshot =>
    ({ document: { store, schema: { schemaVersion: 2, sequences: {} } }, session: {} }) as unknown as TLEditorSnapshot

const home = (over: Partial<BoardRecord> = {}): BoardRecord => ({
    id: 'home_board', name: '🏠 主頁', snapshot: null, thumbnail: null,
    updatedAt: 5, isHome: true, ...over,
})

const cardShape = (id: string): TLSnapshotStore[string] => ({
    typeName: 'shape', id, type: 'card', x: 0, y: 0, index: 'a1', props: { type: 'text', text: 'x' },
})

/** 只是把 base 原樣回傳的假 uniqueName（撞名情境另外測） */
const identity = (base: string) => base

describe('homeBoardHasContent', () => {
    it('沒有主頁 / snapshot 為 null → false', () => {
        expect(homeBoardHasContent(undefined)).toBe(false)
        expect(homeBoardHasContent(null)).toBe(false)
        expect(homeBoardHasContent(home({ snapshot: null }))).toBe(false)
    })

    it('snapshot 只有 page/document 沒有 shape → false', () => {
        const b = home({ snapshot: snap({
            'document:document': { typeName: 'document', id: 'document:document' },
            'page:page': { typeName: 'page', id: 'page:page', index: 'a1' },
        }) })
        expect(homeBoardHasContent(b)).toBe(false)
    })

    it('有卡片 → true', () => {
        expect(homeBoardHasContent(home({ snapshot: snap({ 'shape:a': cardShape('shape:a') }) }))).toBe(true)
    })

    it('非卡片的 shape（筆刷/框線）也算有內容', () => {
        const b = home({ snapshot: snap({
            'shape:d': { typeName: 'shape', id: 'shape:d', type: 'draw', index: 'a1', props: {} },
        }) })
        expect(homeBoardHasContent(b)).toBe(true)
    })
})

describe('buildHomeBoardMigration', () => {
    it('主頁沒內容 → 回傳 null（什麼都不做）', () => {
        expect(buildHomeBoardMigration(home(), 'board_new', identity)).toBeNull()
        expect(buildHomeBoardMigration(undefined, 'board_new', identity)).toBeNull()
    })

    it('有內容 → 整份 snapshot 與 thumbnail 搬到新白板', () => {
        const s = snap({ 'shape:a': cardShape('shape:a') })
        const result = buildHomeBoardMigration(
            home({ snapshot: s, thumbnail: 'data:image/png;base64,AAAA' }),
            'board_new', identity, 1234,
        )!
        expect(result.migratedBoard).toEqual({
            id: 'board_new',
            name: MIGRATED_HOME_BOARD_NAME,
            snapshot: s,
            thumbnail: 'data:image/png;base64,AAAA',
            updatedAt: 1234,
        })
    })

    it('新白板是普通白板（不帶 isHome）', () => {
        const result = buildHomeBoardMigration(
            home({ snapshot: snap({ 'shape:a': cardShape('shape:a') }) }),
            'board_new', identity,
        )!
        expect(result.migratedBoard.isHome).toBeUndefined()
    })

    it('主頁保留 record 與 isHome，只清空 snapshot/thumbnail', () => {
        const result = buildHomeBoardMigration(
            home({ snapshot: snap({ 'shape:a': cardShape('shape:a') }), thumbnail: 'data:image/png;base64,AAAA' }),
            'board_new', identity,
        )!
        expect(result.clearedHome).toMatchObject({
            id: 'home_board', name: '🏠 主頁', isHome: true,
            snapshot: null, thumbnail: null,
        })
    })

    it('名稱撞到既有白板時交給 uniqueName 加序號', () => {
        const result = buildHomeBoardMigration(
            home({ snapshot: snap({ 'shape:a': cardShape('shape:a') }) }),
            'board_new',
            base => `${base} (2)`,
        )!
        expect(result.migratedBoard.name).toBe('主頁白板 (2)')
    })

    it('不 mutate 傳入的主頁', () => {
        const s = snap({ 'shape:a': cardShape('shape:a') })
        const original = home({ snapshot: s, thumbnail: 'thumb' })
        buildHomeBoardMigration(original, 'board_new', identity)
        expect(original.snapshot).toBe(s)
        expect(original.thumbnail).toBe('thumb')
    })

    it('搬完後主頁已無內容（遷移只跑一次、不會重複觸發）', () => {
        const result = buildHomeBoardMigration(
            home({ snapshot: snap({ 'shape:a': cardShape('shape:a') }) }),
            'board_new', identity,
        )!
        expect(homeBoardHasContent(result.clearedHome)).toBe(false)
    })
})
