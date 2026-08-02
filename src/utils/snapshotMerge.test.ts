// src/utils/snapshotMerge.test.ts
//
// 三方合併的真值表。這裡幾乎每一條都對應一種「在真機上很難重現、但一旦錯了
// 就是安靜掉資料」的情況——尤其是「刪除 vs 新增」那組：只看兩邊的話它們長得
// 一模一樣，分不出來就會讓刪掉的卡自己長回來、或讓新增的卡消失。
import { describe, it, expect } from 'vitest'
import type { TLEditorSnapshot } from 'tldraw'
import { hashRecord, hashSnapshotShapes, mergeSnapshots, describeMerge } from './snapshotMerge'
import { getSnapshotStore } from './snapshot'

/** 造 snapshot：cards 是 id → 文字內容 */
function snap(cards: Record<string, string>, extra: Record<string, unknown> = {}): TLEditorSnapshot {
    const store: Record<string, unknown> = {
        'document:document': { typeName: 'document', id: 'document:document', name: '' },
        'page:page': { typeName: 'page', id: 'page:page', name: 'Page 1', index: 'a1' },
        ...extra,
    }
    for (const [id, text] of Object.entries(cards)) {
        store[id] = { typeName: 'shape', id, type: 'card', parentId: 'page:page', index: 'a1', props: { type: 'text', text } }
    }
    return { document: { store, schema: { schemaVersion: 2, sequences: {} } }, session: {} } as unknown as TLEditorSnapshot
}

const cardIds = (s: TLEditorSnapshot) =>
    Object.entries(getSnapshotStore(s)).filter(([, r]) => r?.typeName === 'shape').map(([id]) => id).sort()

const textOf = (s: TLEditorSnapshot, id: string) =>
    (getSnapshotStore(s)[id]?.props as { text?: string } | undefined)?.text

const OPTS = { preferRemoteOnConflict: false }

describe('hashSnapshotShapes', () => {
    it('只收 shape，不收 page/document', () => {
        expect(Object.keys(hashSnapshotShapes(snap({ 'shape:a': 'A' })))).toEqual(['shape:a'])
    })

    it('內容一樣指紋一樣、改了就不一樣', () => {
        const h1 = hashSnapshotShapes(snap({ 'shape:a': 'A' }))
        const h2 = hashSnapshotShapes(snap({ 'shape:a': 'A' }))
        const h3 = hashSnapshotShapes(snap({ 'shape:a': 'B' }))
        expect(h1['shape:a']).toBe(h2['shape:a'])
        expect(h1['shape:a']).not.toBe(h3['shape:a'])
    })

    it('null snapshot 回空物件', () => {
        expect(hashSnapshotShapes(null)).toEqual({})
    })
})

describe('mergeSnapshots — 單邊改動', () => {
    it('只有遠端改過 ⇒ 採用遠端', () => {
        const base = hashSnapshotShapes(snap({ 'shape:a': '原本' }))
        const local = snap({ 'shape:a': '原本' })
        const remote = snap({ 'shape:a': '遠端改的' })

        const r = mergeSnapshots(base, local, remote, OPTS)

        expect(textOf(r.snapshot, 'shape:a')).toBe('遠端改的')
        expect(r.stats.updated).toBe(1)
    })

    it('只有本機改過 ⇒ 保留本機（不會被遠端的舊版蓋掉）', () => {
        const base = hashSnapshotShapes(snap({ 'shape:a': '原本' }))
        const local = snap({ 'shape:a': '本機改的' })
        const remote = snap({ 'shape:a': '原本' })

        const r = mergeSnapshots(base, local, remote, OPTS)

        expect(textOf(r.snapshot, 'shape:a')).toBe('本機改的')
        expect(r.stats.updated).toBe(0)
    })

    // 這條是整件事的重點：兩邊各改各的卡，兩邊的修改都要留著
    it('兩邊改不同的卡 ⇒ 兩邊的修改都保留', () => {
        const base = hashSnapshotShapes(snap({ 'shape:a': 'A', 'shape:b': 'B' }))
        const local = snap({ 'shape:a': 'A 本機改', 'shape:b': 'B' })
        const remote = snap({ 'shape:a': 'A', 'shape:b': 'B 遠端改' })

        const r = mergeSnapshots(base, local, remote, OPTS)

        expect(textOf(r.snapshot, 'shape:a')).toBe('A 本機改')
        expect(textOf(r.snapshot, 'shape:b')).toBe('B 遠端改')
    })
})

describe('mergeSnapshots — 新增與刪除（只看兩邊分不出來的那組）', () => {
    it('遠端新增的卡會收進來', () => {
        const base = hashSnapshotShapes(snap({ 'shape:a': 'A' }))
        const r = mergeSnapshots(base, snap({ 'shape:a': 'A' }), snap({ 'shape:a': 'A', 'shape:new': '新的' }), OPTS)

        expect(cardIds(r.snapshot)).toEqual(['shape:a', 'shape:new'])
        expect(r.stats.added).toBe(1)
    })

    it('本機新增的卡不會因為遠端沒有就被刪掉', () => {
        const base = hashSnapshotShapes(snap({ 'shape:a': 'A' }))
        const r = mergeSnapshots(base, snap({ 'shape:a': 'A', 'shape:mine': '我剛建的' }), snap({ 'shape:a': 'A' }), OPTS)

        expect(cardIds(r.snapshot)).toEqual(['shape:a', 'shape:mine'])
        expect(r.stats.removed).toBe(0)
    })

    it('遠端刪掉的卡（本機沒動過）會跟著刪', () => {
        const base = hashSnapshotShapes(snap({ 'shape:a': 'A', 'shape:gone': '要被刪的' }))
        const r = mergeSnapshots(base, snap({ 'shape:a': 'A', 'shape:gone': '要被刪的' }), snap({ 'shape:a': 'A' }), OPTS)

        expect(cardIds(r.snapshot)).toEqual(['shape:a'])
        expect(r.stats.removed).toBe(1)
    })

    it('本機刪掉的卡不會自己長回來', () => {
        const base = hashSnapshotShapes(snap({ 'shape:a': 'A', 'shape:gone': '刪掉了' }))
        const r = mergeSnapshots(base, snap({ 'shape:a': 'A' }), snap({ 'shape:a': 'A', 'shape:gone': '刪掉了' }), OPTS)

        expect(cardIds(r.snapshot)).toEqual(['shape:a'])
        expect(r.stats.added).toBe(0)
    })

    // 刪除 vs 編輯：一邊刪、另一邊還在改。刪除是可以再做一次的，
    // 打好的字回不來——所以編輯優先。
    it('遠端刪掉、但本機正好改過它 ⇒ 保留本機的修改', () => {
        const base = hashSnapshotShapes(snap({ 'shape:a': '原本' }))
        const r = mergeSnapshots(base, snap({ 'shape:a': '本機剛改' }), snap({}), OPTS)

        expect(textOf(r.snapshot, 'shape:a')).toBe('本機剛改')
    })

    it('本機刪掉、但遠端正好改過它 ⇒ 收回遠端的修改', () => {
        const base = hashSnapshotShapes(snap({ 'shape:a': '原本' }))
        const r = mergeSnapshots(base, snap({}), snap({ 'shape:a': '遠端剛改' }), OPTS)

        expect(textOf(r.snapshot, 'shape:a')).toBe('遠端剛改')
    })

    it('兩邊都刪掉 ⇒ 就是沒了，不會復活', () => {
        const base = hashSnapshotShapes(snap({ 'shape:a': 'A', 'shape:gone': 'X' }))
        const r = mergeSnapshots(base, snap({ 'shape:a': 'A' }), snap({ 'shape:a': 'A' }), OPTS)

        expect(cardIds(r.snapshot)).toEqual(['shape:a'])
    })
})

describe('mergeSnapshots — 同一張卡兩邊都改（唯一會丟東西的地方）', () => {
    const base = hashSnapshotShapes(snap({ 'shape:a': '原本' }))
    const local = snap({ 'shape:a': '本機版' })
    const remote = snap({ 'shape:a': '遠端版' })

    it('preferRemoteOnConflict=false ⇒ 留本機', () => {
        const r = mergeSnapshots(base, local, remote, { preferRemoteOnConflict: false })
        expect(textOf(r.snapshot, 'shape:a')).toBe('本機版')
        expect(r.stats.conflicts).toBe(1)
    })

    it('preferRemoteOnConflict=true ⇒ 留遠端', () => {
        const r = mergeSnapshots(base, local, remote, { preferRemoteOnConflict: true })
        expect(textOf(r.snapshot, 'shape:a')).toBe('遠端版')
        expect(r.stats.conflicts).toBe(1)
    })

    it('兩邊改成一模一樣的內容不算衝突', () => {
        const r = mergeSnapshots(base, snap({ 'shape:a': '同樣的字' }), snap({ 'shape:a': '同樣的字' }), OPTS)
        expect(r.stats.conflicts).toBe(0)
    })
})

describe('mergeSnapshots — 邊界', () => {
    it('沒有 base（第一次同步）時，兩邊的卡片都當成新增，一張都不會掉', () => {
        const r = mergeSnapshots({}, snap({ 'shape:a': 'A' }), snap({ 'shape:b': 'B' }), OPTS)
        expect(cardIds(r.snapshot)).toEqual(['shape:a', 'shape:b'])
    })

    it('遠端 snapshot 是 null ⇒ 用本機的，不做任何合併', () => {
        const local = snap({ 'shape:a': 'A' })
        const r = mergeSnapshots({}, local, null, OPTS)
        expect(r.snapshot).toBe(local)
        expect(r.changed).toBe(false)
    })

    it('完全沒有差異時 changed = false（呼叫端可以省掉一次寫入）', () => {
        const base = hashSnapshotShapes(snap({ 'shape:a': 'A' }))
        const r = mergeSnapshots(base, snap({ 'shape:a': 'A' }), snap({ 'shape:a': 'A' }), OPTS)
        expect(r.changed).toBe(false)
    })

    // 非 shape 記錄＝頁面骨架與檢視狀態，拿遠端的來蓋只會把本機的縮放/捲動換掉
    it('page/document 一律用本機的', () => {
        const local = snap({ 'shape:a': 'A' }, { 'page:page': { typeName: 'page', id: 'page:page', name: '本機頁名' } })
        const remote = snap({ 'shape:a': 'A' }, { 'page:page': { typeName: 'page', id: 'page:page', name: '遠端頁名' } })
        const r = mergeSnapshots({}, local, remote, OPTS)
        expect((getSnapshotStore(r.snapshot)['page:page'] as { name?: string }).name).toBe('本機頁名')
    })

    it('遠端獨有的非 shape 記錄會補進來（另一台新建的頁面）', () => {
        const local = snap({ 'shape:a': 'A' })
        const remote = snap({ 'shape:a': 'A' }, { 'page:p2': { typeName: 'page', id: 'page:p2', name: '第二頁' } })
        const r = mergeSnapshots({}, local, remote, OPTS)
        expect(getSnapshotStore(r.snapshot)['page:p2']).toBeTruthy()
    })
})

describe('describeMerge', () => {
    it('沒有變動回 null', () => {
        expect(describeMerge({ added: 0, updated: 0, removed: 0, conflicts: 0 })).toBeNull()
    })

    it('把統計講成一句話', () => {
        const s = describeMerge({ added: 2, updated: 1, removed: 0, conflicts: 1 })
        expect(s).toContain('2 張新卡片')
        expect(s).toContain('兩邊都改過')
    })
})

describe('hashRecord', () => {
    it('undefined 也能算（不會丟例外）', () => {
        expect(typeof hashRecord(undefined)).toBe('string')
    })
})
