// src/utils/cardActivity.ts
//
// 卡片活動時間（RC16）。
//
// 卡片原本沒有任何時間戳，週回顧只能拿「白板最後更新時間」來猜：
// 板這週動過一次，整塊板的全部卡片就算進這週；沒動過就全部是 0。
// 從 2026-10-02 起改成每張卡自己記：
//   - shape.meta.createdAt / updatedAt（毫秒）：建立、內容改動時寫入。
//     meta 是 tldraw 本來就有、會跟著 snapshot 存檔與雲端同步的欄位，不必動資料結構。
//   - TodoItem.checkedAt：打勾那一刻寫入、取消勾就拿掉。
//
// 在這之前的週沒有資料可以補（卡片沒時間、備份只留最近 5 份），
// 只能靠本來就帶日期的東西：日記日期、待辦到期日。

import type { TodoItem } from '../components/card-shape/type/CardShape'

/** 開始記錄的那一天（本地 00:00）。這之前的「卡片活動」與「連結」沒有紀錄 */
export const ACTIVITY_TRACKING_SINCE = new Date(2026, 9, 2).getTime()

export interface CardActivityMeta {
    createdAt?: number
    updatedAt?: number
}

export type TrackingCoverage = 'none' | 'partial' | 'full'

/** 這段期間有沒有卡片層級的紀錄：整段在開始記錄之前＝none，跨過那天＝partial */
export function trackingCoverage(rangeStart: Date, rangeEnd: Date): TrackingCoverage {
    if (rangeEnd.getTime() < ACTIVITY_TRACKING_SINCE) return 'none'
    if (rangeStart.getTime() < ACTIVITY_TRACKING_SINCE) return 'partial'
    return 'full'
}

const inRange = (t: number | null | undefined, start: Date, end: Date) =>
    typeof t === 'number' && t >= start.getTime() && t <= end.getTime()

/** 這張卡在期間內建立或改過內容 */
export function cardActiveIn(meta: unknown, start: Date, end: Date): boolean {
    const m = (meta ?? {}) as CardActivityMeta
    return inRange(m.updatedAt, start, end) || inRange(m.createdAt, start, end)
}

/** 'YYYY-MM-DD' 落在期間內（以本地日期比） */
function dueInRange(due: string | null | undefined, start: Date, end: Date): boolean {
    const m = due?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return false
    return inRange(new Date(+m[1], +m[2] - 1, +m[3], 12).getTime(), start, end)
}

/**
 * 這個待辦算不算「在這段期間完成」。
 * 有 checkedAt 就看它；沒有（10/02 之前勾的）退回看到期日——到期日在這週、而且已經勾了。
 */
export function todoCompletedIn(t: TodoItem, start: Date, end: Date): boolean {
    if (!t.checked) return false
    if (typeof t.checkedAt === 'number') return inRange(t.checkedAt, start, end)
    return dueInRange(t.dueDate, start, end)
}

/** 新建卡片的 meta */
export function stampCreated(meta: unknown, now: number): Record<string, unknown> {
    const m = (meta ?? {}) as Record<string, unknown>
    return { ...m, createdAt: typeof m.createdAt === 'number' ? m.createdAt : now, updatedAt: now }
}

/** 內容改動後的 meta */
export function stampUpdated(meta: unknown, now: number): Record<string, unknown> {
    return { ...((meta ?? {}) as Record<string, unknown>), updatedAt: now }
}

/**
 * 算不算「內容改動」：props 裡除了尺寸與介面狀態以外有任何欄位不同。
 * 拖曳位置（x/y 不在 props 裡）與縮放卡片不算——那是整理版面，不是這週做了什麼。
 * `state`（進出編輯模式）與 `preview`（圖片預覽開關）也不算：雙擊進去、什麼都沒改就出來，不是活動。
 */
const NON_CONTENT_PROPS = new Set(['w', 'h', 'state', 'preview'])

export function isContentChange(prev: Record<string, unknown>, next: Record<string, unknown>): boolean {
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
    for (const k of keys) {
        if (NON_CONTENT_PROPS.has(k)) continue
        if (prev[k] !== next[k]) return true
    }
    return false
}

/**
 * 依勾選狀態的變化補上／拿掉 checkedAt。沒有任何項目變化就回傳原陣列（呼叫端可用 === 判斷）。
 * 用 id 對照前後，不是索引（同 snapshotPatch.toggleTodo 的理由）。
 */
export function withCheckedAt(prev: TodoItem[] | undefined, next: TodoItem[] | undefined, now: number): TodoItem[] | undefined {
    if (!Array.isArray(next)) return next
    const before = new Map((prev ?? []).map(t => [t.id, t]))
    let changed = false
    const out = next.map(t => {
        const was = before.get(t.id)
        if (t.checked && !was?.checked && typeof t.checkedAt !== 'number') { changed = true; return { ...t, checkedAt: now } }
        if (!t.checked && t.checkedAt != null) {
            changed = true
            const { checkedAt: _drop, ...rest } = t
            void _drop
            return rest
        }
        return t
    })
    return changed ? out : next
}
