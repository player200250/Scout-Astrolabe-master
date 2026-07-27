// @vitest-environment jsdom
// src/sync/syncState.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
    isDirty, selectDirtyBoards, markPushed, forgetBoard, pruneState,
    hashThumbnail, markThumbPushed, isThumbnailUnchanged,
    loadSyncState, saveSyncState, clearSyncState, EMPTY_SYNC_STATE, type SyncState,
} from './syncState'

const USER = 'user-abc'
const st = (
    pushed: Record<string, number>,
    userId: string | null = USER,
    thumbHash: Record<string, string> = {},
): SyncState => ({ userId, pushed, thumbHash, lastPulledAt: null })

describe('syncState — dirty 判斷', () => {
    it('從沒推過的板算 dirty', () => {
        expect(isDirty({ id: 'b1', updatedAt: 100 }, st({}))).toBe(true)
    })

    it('推過之後又改過（updatedAt 變大）算 dirty', () => {
        expect(isDirty({ id: 'b1', updatedAt: 200 }, st({ b1: 100 }))).toBe(true)
    })

    it('推過之後沒再改就不是 dirty', () => {
        expect(isDirty({ id: 'b1', updatedAt: 100 }, st({ b1: 100 }))).toBe(false)
    })

    // 從雲端拉回來的板 updatedAt 會比本機記錄的舊（本機那筆被覆蓋掉了），
    // 這種情況不該被當成「本機有新東西要推」，否則會把剛拉回的版本再推一次。
    it('本機比記錄還舊時不算 dirty', () => {
        expect(isDirty({ id: 'b1', updatedAt: 50 }, st({ b1: 100 }))).toBe(false)
    })

    it('selectDirtyBoards 只挑出有變更的', () => {
        const boards = [
            { id: 'b1', updatedAt: 100 },   // 已推過
            { id: 'b2', updatedAt: 300 },   // 推過但又改了
            { id: 'b3', updatedAt: 10 },    // 沒推過
        ]
        const dirty = selectDirtyBoards(boards, st({ b1: 100, b2: 200 }))
        expect(dirty.map(b => b.id)).toEqual(['b2', 'b3'])
    })
})

describe('syncState — 記錄更新（純函式，不改原物件）', () => {
    it('markPushed 記下版本且不動到原本的 state', () => {
        const before = st({ b1: 100 })
        const after = markPushed(before, 'b2', 500)
        expect(after.pushed).toEqual({ b1: 100, b2: 500 })
        expect(before.pushed).toEqual({ b1: 100 })
    })

    it('forgetBoard 移掉指定板；不存在時原樣回傳', () => {
        expect(forgetBoard(st({ b1: 1, b2: 2 }), 'b1').pushed).toEqual({ b2: 2 })
        const same = st({ b1: 1 })
        expect(forgetBoard(same, 'nope')).toBe(same)
    })

    it('pruneState 清掉本機已不存在的板', () => {
        expect(pruneState(st({ b1: 1, b2: 2, b3: 3 }), ['b1', 'b3']).pushed)
            .toEqual({ b1: 1, b3: 3 })
    })

    it('pruneState 沒東西可清時回原物件（避免無謂寫入）', () => {
        const same = st({ b1: 1 })
        expect(pruneState(same, ['b1'])).toBe(same)
    })
})

describe('syncState — 縮圖指紋（省流量用）', () => {
    const THUMB = 'data:image/webp;base64,AAAABBBBCCCC'

    it('同一張圖給同一個指紋，不同圖給不同指紋', () => {
        expect(hashThumbnail(THUMB)).toBe(hashThumbnail(THUMB))
        expect(hashThumbnail(THUMB)).not.toBe(hashThumbnail(THUMB + 'X'))
    })

    it('沒有縮圖時是空字串（不是 undefined，比對才不會出錯）', () => {
        expect(hashThumbnail(null)).toBe('')
        expect(hashThumbnail(undefined)).toBe('')
        expect(hashThumbnail('')).toBe('')
    })

    // 這是「省略縮圖欄位」的安全條件：沒推過的板不能省，
    // 否則 upsert 會 INSERT 出一列 thumbnail = null
    it('從沒推過的板一律視為「有變」（必須送）', () => {
        expect(isThumbnailUnchanged(st({}), 'b1', THUMB)).toBe(false)
    })

    it('推過且沒換圖 ⇒ 可以省略', () => {
        const after = markThumbPushed(st({}), 'b1', hashThumbnail(THUMB))
        expect(isThumbnailUnchanged(after, 'b1', THUMB)).toBe(true)
    })

    it('換了圖就要重送', () => {
        const after = markThumbPushed(st({}), 'b1', hashThumbnail(THUMB))
        expect(isThumbnailUnchanged(after, 'b1', THUMB + '差一點')).toBe(false)
    })

    it('本來沒圖、後來有圖，也算有變', () => {
        const after = markThumbPushed(st({}), 'b1', hashThumbnail(null))
        expect(isThumbnailUnchanged(after, 'b1', THUMB)).toBe(false)
    })

    it('markThumbPushed 沒變化時回原物件（避免無謂寫入）', () => {
        const before = markThumbPushed(st({}), 'b1', 'abc')
        expect(markThumbPushed(before, 'b1', 'abc')).toBe(before)
    })

    it('forgetBoard / pruneState 會連縮圖指紋一起清掉', () => {
        const s = st({ b1: 1, b2: 2 }, USER, { b1: 'h1', b2: 'h2' })
        expect(forgetBoard(s, 'b1').thumbHash).toEqual({ b2: 'h2' })
        expect(pruneState(s, ['b2']).thumbHash).toEqual({ b2: 'h2' })
    })
})

describe('syncState — 持久化', () => {
    beforeEach(() => { localStorage.clear() })

    it('沒存過時回空記錄，並帶上目前的 userId', () => {
        expect(loadSyncState(USER)).toEqual({ ...EMPTY_SYNC_STATE, userId: USER })
    })

    it('存了之後讀得回來', () => {
        saveSyncState({ userId: USER, pushed: { b1: 123 }, thumbHash: {}, lastPulledAt: 456 })
        expect(loadSyncState(USER)).toEqual({ userId: USER, pushed: { b1: 123 }, thumbHash: {}, lastPulledAt: 456 })
    })

    // 這條是這個檔案最重要的保護：換帳號後若沿用舊記錄，新帳號雲端明明是空的、
    // 本機卻以為「都推過了」，結果一塊板都不會上傳。
    it('userId 不符時整份作廢（換帳號 ⇒ 全部重推）', () => {
        saveSyncState({ userId: USER, pushed: { b1: 123 }, thumbHash: {}, lastPulledAt: 456 })
        expect(loadSyncState('another-user')).toEqual({ ...EMPTY_SYNC_STATE, userId: 'another-user' })
    })

    it('未登入（userId null）也不會沿用別人的記錄', () => {
        saveSyncState({ userId: USER, pushed: { b1: 123 }, thumbHash: {}, lastPulledAt: null })
        expect(loadSyncState(null).pushed).toEqual({})
    })

    it('localStorage 內容壞掉時回空記錄而不是讓 App 掛掉', () => {
        localStorage.setItem('astrolabe-sync-state', '{壞掉的 JSON')
        expect(loadSyncState(USER)).toEqual({ ...EMPTY_SYNC_STATE, userId: USER })
    })

    it('clear 之後回到空記錄', () => {
        saveSyncState({ userId: USER, pushed: { b1: 1 }, thumbHash: {}, lastPulledAt: 1 })
        clearSyncState()
        expect(loadSyncState(USER).pushed).toEqual({})
    })
})
