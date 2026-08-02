// src/utils/cardMeta.ts
//
// 卡片類型的共用顯示 metadata（圖示／文字標籤／識別色）。
// 原本只存在於 CardLibrary.tsx 內部（B6/D5 加的 TYPE_COLOR 也在那），
// 但 Inbox Triage（N2）與 Tag Manager（N4）都要用同一組，故抽出共用，
// 避免同一份對照表在三個面板各抄一次、日後新增 CardType 時漏改。
//
// 註：涵蓋完整 CardType（含 image/board）；CardLibrary 只列出其中一部分供篩選，
// 以子集索引此表是安全的。

import type { CardType, CardStatusType, PriorityType } from '../components/card-shape/type/CardShape'
import type { IconName } from '../components/ui/icons'

/**
 * CardType → 線性圖示名稱（`components/ui/icons.tsx` 的 registry key）。
 *
 * 舊的 emoji 版 `TYPE_ICON` 已於圖示第 3 批**刪除**——最後三個使用者
 * （卡片庫／搜尋／收件匣整理）都改吃這份了。不要為了「方便」再加回一份字串版：
 * 兩份並存的那段期間，同一種卡片在不同面板長得不一樣正是這樣來的。
 *
 * 放在這裡而不是 icons.tsx：icons.tsx 是元件檔，混著匯出常數會踩
 * `react-refresh/only-export-components`（熱更新退化成整頁重載，CI 也會擋）。
 * 這裡對 IconName 用 **type-only import**，不會產生執行期相依。
 */
export const CARD_TYPE_ICON: Record<CardType, IconName> = {
    text: 'cardText', todo: 'cardTodo', link: 'cardLink', journal: 'cardJournal',
    heading: 'cardHeading', sticky: 'cardSticky', table: 'cardTable', color: 'cardColor',
    file: 'cardFile', image: 'cardImage', board: 'cardBoard',
}

export const TYPE_LABEL: Record<CardType, string> = {
    text: '文字', todo: 'Todo', link: '連結', journal: 'Journal', heading: '標題',
    sticky: '便利貼', table: '表格', color: '顏色樣本', file: '檔案', image: '圖片', board: '白板卡',
}

/** B6/D5 — 每種卡片類型的識別色，用於圖示與類型標籤，一眼分類 */
export const TYPE_COLOR: Record<CardType, string> = {
    text: '#3b82f6', todo: '#22c55e', link: '#a855f7', journal: '#f59e0b', heading: '#6366f1',
    sticky: '#eab308', table: '#14b8a6', color: '#ec4899', file: '#64748b', image: '#0ea5e9', board: '#7c3aed',
}

/**
 * 卡片狀態／優先級的圖示與標籤。
 *
 * **為什麼抽出來**：同一組詞彙原本散在四個地方各寫一次——右鍵選單的批次設定、
 * 卡片左上角的 status badge、篩選面板的 chip、卡片屬性列的 select。
 * 換圖示時逐一改過才發現它們早就長得不一樣（emoji 版本連順序都不同）。
 * 新增狀態或改圖示只改這裡，不會再有第五份。
 *
 * 註：`CardPropsBar` 只吃得到 label（原生 <option> 放不了 SVG），這是刻意的例外。
 */
export const STATUS_ICON: Record<CardStatusType, IconName> = {
    none: 'statusNone', todo: 'statusTodo', 'in-progress': 'statusInProgress', done: 'done',
}

export const STATUS_LABEL: Record<CardStatusType, string> = {
    none: '無', todo: '待辦', 'in-progress': '進行中', done: '完成',
}

/** 高中低走 Signal 階梯（靠形狀分級，不靠顏色）；none 與「清除狀態」共用 CircleOff。 */
export const PRIORITY_ICON: Record<PriorityType, IconName> = {
    none: 'priorityNone', low: 'priorityLow', medium: 'priorityMedium', high: 'priorityHigh',
}

export const PRIORITY_LABEL: Record<PriorityType, string> = {
    none: '無', low: '低', medium: '中', high: '高',
}

/** 將 #rrggbb 轉為指定 alpha 的 rgba（用於類型色的淡底） */
export function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
