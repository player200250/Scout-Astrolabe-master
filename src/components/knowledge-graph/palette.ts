// src/components/knowledge-graph/palette.ts
//
// 知識圖譜「畫布這一層」的配色：畫布本身與浮在畫布上的東西（圖例、tooltip、進度面板）。
// 不跟主題走——理由見 KnowledgeGraph.tsx 檔頭「畫布配色」。抽出來是因為進度面板（QuestPanel）也要用。

export const SURFACE = '#0f172a'
/** legend／tooltip／面板的底——浮在畫布上，所以不跟主題走 */
export const SURFACE_OVERLAY = 'rgba(15,23,42,0.92)'
export const INK = {
    strong: 'rgba(255,255,255,0.9)',
    normal: 'rgba(255,255,255,0.6)',
    faint: 'rgba(255,255,255,0.45)',
    hairline: 'rgba(255,255,255,0.12)',
}
/** 主線／支線的主色（節點、圖例、面板共用） */
export const QUEST_COLOR = { main: '#f97316', side: '#a78bfa' }
/** 主線／支線標題字色（比主色亮，深底上好讀） */
export const QUEST_TEXT = { main: '#fdba74', side: '#ddd6fe' }
export const OVERDUE = '#f87171'
