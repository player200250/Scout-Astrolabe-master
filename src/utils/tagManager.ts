// src/utils/tagManager.ts
//
// Tag Manager（N4）的純函式層。
// 標籤原本只能在卡片上逐張打字，打錯就多一個孤兒標籤，且散在各白板無處統一管理。
// 這裡提供跨白板的統計、改名、合併、刪除；改名到既有標籤即為「合併」（同一條路徑）。
//
// 全部回傳新物件、不 mutate 傳入的 boards；實際存檔與 editor 同步由 useTags 負責。

import type { BoardRecord } from '../db'
import { getSnapshotStore, withUpdatedStore } from './snapshot'

export interface TagStat {
    tag: string
    /** 使用此標籤的卡片張數 */
    count: number
    /** 出現此標籤的白板 id（去重） */
    boardIds: string[]
}

/** 某張卡片的 tags 被改寫後的結果，供呼叫端同步到已掛載的 editor。 */
export interface TagShapeUpdate {
    boardId: string
    shapeId: string
    tags: string[]
}

export interface TagRewriteResult {
    /** 只包含真的有變動的白板（已帶新 snapshot） */
    changedBoards: BoardRecord[]
    updates: TagShapeUpdate[]
}

/** 去掉頭尾空白與開頭的 #（使用者常連 # 一起輸入）。 */
export function normalizeTagName(raw: string): string {
    return raw.trim().replace(/^#+/, '').trim()
}

/**
 * 驗證標籤新名稱，合法回傳 null，否則回傳錯誤訊息。
 * 允許改成既有標籤——那就是合併，由呼叫端另外向使用者確認。
 */
export function validateTagName(next: string, current: string): string | null {
    const name = normalizeTagName(next)
    if (!name) return '標籤名稱不能是空的'
    if (name === current) return '名稱沒有變更'
    if (/\s/.test(name)) return '標籤名稱不能有空白'
    if (name.length > 30) return '標籤名稱請控制在 30 字以內'
    return null
}

/** 統計所有白板的標籤使用情況，依張數多寡排序（同張數依名稱）。 */
export function collectTagStats(boards: BoardRecord[]): TagStat[] {
    const map = new Map<string, { count: number; boardIds: Set<string> }>()
    for (const board of boards) {
        if (!board.snapshot) continue
        const store = getSnapshotStore(board.snapshot)
        for (const record of Object.values(store)) {
            if (record.typeName !== 'shape' || record.type !== 'card') continue
            const tags = record.props?.tags
            if (!Array.isArray(tags)) continue
            // 同一張卡重複列同一個 tag 時只算一次
            for (const tag of new Set(tags)) {
                if (typeof tag !== 'string' || !tag) continue
                let entry = map.get(tag)
                if (!entry) map.set(tag, entry = { count: 0, boardIds: new Set() })
                entry.count++
                entry.boardIds.add(board.id)
            }
        }
    }
    return [...map.entries()]
        .map(([tag, e]) => ({ tag, count: e.count, boardIds: [...e.boardIds] }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/**
 * 對單一 tags 陣列套用改寫；回傳 null 代表沒變動。
 * to 為 null＝刪除該標籤；to 為既有標籤＝合併（去重、保留原順序）。
 */
function rewriteTags(tags: string[], from: string, to: string | null): string[] | null {
    if (!tags.includes(from)) return null
    const next: string[] = []
    for (const tag of tags) {
        const mapped = tag === from ? to : tag
        if (mapped === null) continue
        if (!next.includes(mapped)) next.push(mapped)   // 合併到既有標籤時會撞名，去重
    }
    return next
}

/**
 * 跨白板改寫標籤：to 給字串＝改名／合併，給 null＝刪除。
 * 只回傳有變動的白板，讓呼叫端不用重存整個 vault。
 */
export function rewriteTagInBoards(boards: BoardRecord[], from: string, to: string | null): TagRewriteResult {
    const changedBoards: BoardRecord[] = []
    const updates: TagShapeUpdate[] = []

    for (const board of boards) {
        if (!board.snapshot) continue
        const store = getSnapshotStore(board.snapshot)
        let newStore: typeof store | null = null

        for (const record of Object.values(store)) {
            if (record.typeName !== 'shape' || record.type !== 'card') continue
            const tags = record.props?.tags
            if (!Array.isArray(tags)) continue
            const nextTags = rewriteTags(tags as string[], from, to)
            if (!nextTags) continue

            newStore ??= { ...store }
            newStore[record.id] = { ...record, props: { ...record.props, tags: nextTags } }
            updates.push({ boardId: board.id, shapeId: record.id, tags: nextTags })
        }

        if (newStore) {
            changedBoards.push({
                ...board,
                snapshot: withUpdatedStore(board.snapshot, newStore),
                updatedAt: Date.now(),
            })
        }
    }

    return { changedBoards, updates }
}
