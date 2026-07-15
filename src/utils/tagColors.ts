// src/utils/tagColors.ts
//
// 標籤顏色（N4）。顏色純屬顯示偏好、不屬於卡片資料，故存 localStorage
// （與 theme / card-library-section-collapsed 同一套做法），不動 Dexie schema。
//
// 未指定顏色的標籤以名稱雜湊挑一個固定色：新標籤一出現就有穩定顏色，
// 不必先去 Tag Manager 設定，也不會每次 render 跳色。

const STORAGE_KEY = 'tag-colors'

/** 可選色盤（與卡片類型色系一致，深淺底都看得清） */
export const TAG_PALETTE = [
    '#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e', '#84cc16',
    '#eab308', '#f97316', '#ef4444', '#ec4899', '#a855f7',
    '#6366f1', '#64748b',
]

export type TagColorMap = Record<string, string>

export function loadTagColors(): TagColorMap {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
        return parsed as TagColorMap
    } catch {
        return {}
    }
}

export function saveTagColors(colors: TagColorMap): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(colors))
    } catch { /* 容量滿或隱私模式：顏色設定丟失不影響資料，忽略 */ }
}

/** 名稱雜湊 → 色盤索引，作為未指定顏色時的穩定預設色。 */
export function defaultTagColor(tag: string): string {
    let hash = 0
    for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) & 0xffffffff
    return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length]
}

export function getTagColor(colors: TagColorMap, tag: string): string {
    return colors[tag] ?? defaultTagColor(tag)
}

/**
 * 標籤改名／合併／刪除後同步顏色設定：
 * - to 為 null（刪除）：移除該筆
 * - to 已有自訂色（合併到既有標籤）：保留目標既有的顏色，只丟掉來源的
 * - 否則：把來源的顏色接到新名字上
 */
export function rewriteTagColor(colors: TagColorMap, from: string, to: string | null): TagColorMap {
    if (!(from in colors)) return colors
    const next = { ...colors }
    const fromColor = next[from]
    delete next[from]
    if (to !== null && !(to in next)) next[to] = fromColor
    return next
}
