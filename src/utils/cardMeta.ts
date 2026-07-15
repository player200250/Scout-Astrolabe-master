// src/utils/cardMeta.ts
//
// 卡片類型的共用顯示 metadata（圖示／文字標籤／識別色）。
// 原本只存在於 CardLibrary.tsx 內部（B6/D5 加的 TYPE_COLOR 也在那），
// 但 Inbox Triage（N2）與 Tag Manager（N4）都要用同一組，故抽出共用，
// 避免同一份對照表在三個面板各抄一次、日後新增 CardType 時漏改。
//
// 註：涵蓋完整 CardType（含 image/board）；CardLibrary 只列出其中一部分供篩選，
// 以子集索引此表是安全的。

import type { CardType } from '../components/card-shape/type/CardShape'

export const TYPE_ICON: Record<CardType, string> = {
    text: '📝', todo: '✅', link: '🔗', journal: '📖', heading: 'A',
    sticky: '📌', table: '▦', color: '🎨', file: '📎', image: '🖼️', board: '🗂️',
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

/** 將 #rrggbb 轉為指定 alpha 的 rgba（用於類型色的淡底） */
export function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
