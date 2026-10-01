// src/CardShape.ts
import { T } from '../../../theme/tokens'
import type { TLBaseShape } from '@tldraw/editor'

export type CardType = 'text' | 'image' | 'todo' | 'link' | 'board' | 'journal' | 'heading' | 'sticky' | 'table' | 'color' | 'file'

export interface ColorSwatch {
    id: string
    hex: string
    name: string
}

export interface TableCell {
    id: string
    content: string
}

export interface TableRow {
    id: string
    cells: TableCell[]
}
export type CardState = 'idle' | 'editing'

// 卡片顏色
export type CardColor =
    | 'none'
    | 'red'
    | 'orange'
    | 'yellow'
    | 'green'
    | 'blue'
    | 'purple'
    | 'pink'
    | 'dark'

/**
 * darkBg：夜間模式的底色（2026-10-01）。原本只有日間淺底，夜間套色後變成「淺底＋主題淺灰字」，對比 1.33:1 讀不到。
 * 算法＝夜間卡片底 #1e293b 疊 20% accent：低於 20% 各色跟無色卡分不出來；再高黃色對比會掉到 7:1 以下。
 * 對主題字色 #e2e8f0 的對比：紅 9.5／橙 8.8／黃 7.4／綠 8.2／藍 9.1／紫 9.5／粉 9.5。
 * none 與 dark 不走這張表的底色（見 cardBackground）。
 */
export const CARD_COLORS: Record<CardColor, { bg: string; darkBg: string; accent: string; label: string }> = {
    none:   { bg: '#ffffff', darkBg: '#1e293b', accent: '#e0e0e0', label: '無' },
    red:    { bg: '#fff5f5', darkBg: '#4b303f', accent: '#ff4d4f', label: '紅' },
    orange: { bg: '#fff7f0', darkBg: '#4b392f', accent: '#ff7a00', label: '橙' },
    yellow: { bg: '#fffbe6', darkBg: '#4a4a33', accent: '#facc15', label: '黃' },
    green:  { bg: '#f0fff4', darkBg: '#1f4842', accent: '#22c55e', label: '綠' },
    blue:   { bg: '#eff6ff', darkBg: '#243b60', accent: '#3b82f6', label: '藍' },
    purple: { bg: '#faf5ff', darkBg: '#3a3261', accent: '#a855f7', label: '紫' },
    pink:   { bg: '#fdf2f8', darkBg: '#472f4e', accent: '#ec4899', label: '粉' },
    dark:   { bg: '#1a1a2e', darkBg: '#1a1a2e', accent: '#6366f1', label: '深' },
}

/**
 * 一般卡片（非便利貼、非標題）的底色。卡片本體與文字卡底部的淡出漸層共用，兩處才不會各算各的
 * （漸層原本寫死吃日間 bg，無色卡在夜間也會拖出一條白邊）。
 * 無色＝跟著主題的卡片底 token；深色卡日夜都是深底。
 */
export function cardBackground(color: CardColor | undefined, isDark: boolean): string {
    if (!color || color === 'none') return T.bgCard
    const c = CARD_COLORS[color]
    return isDark ? c.darkBg : c.bg
}

export type StickyColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange'

export const STICKY_COLORS: Record<StickyColor, { bg: string; darkBg: string; label: string }> = {
    yellow: { bg: '#FEF08A', darkBg: '#CA8A04', label: '黃' },
    green:  { bg: '#BBF7D0', darkBg: '#15803D', label: '綠' },
    blue:   { bg: '#BAE6FD', darkBg: '#0369A1', label: '藍' },
    pink:   { bg: '#FBCFE8', darkBg: '#BE185D', label: '粉' },
    orange: { bg: '#FED7AA', darkBg: '#C2410C', label: '橙' },
}

export const STICKY_COLOR_LIST: StickyColor[] = ['yellow', 'green', 'blue', 'pink', 'orange']

export type CardStatusType = 'none' | 'todo' | 'in-progress' | 'done'
export type PriorityType   = 'none' | 'low'  | 'medium'      | 'high'

export interface TodoItem {
    id: string
    text: string
    checked: boolean
    dueDate?: string | null  // YYYY-MM-DD
}

export interface TLCardProps {
    w: number
    h: number
    type: CardType
    color: CardColor

    // ---- Text ----
    text: string

    // ---- Image ----
    image: string | null

    // ---- Todo ----
    todos: TodoItem[]

    // ---- Link ----
    url: string | null
    title?: string
    description?: string
    thumbnail?: string
    linkEmbedUrl: string | null

    // ---- Board ----
    linkedBoardId?: string | null

    // ---- Journal ----
    // 格式 'YYYY-MM-DD'，系統用來判斷當天是否已建立
    // 建立後不可修改，作為唯一識別鍵
    journalDate?: string | null

    // ---- Table ----
    tableData?: TableRow[]
    tableCols?: number
    // 標題列開關：true（或未設，向後相容）時第一列以標題樣式顯示
    tableHeaderRow?: boolean

    // ---- Color Swatch ----
    swatches?: ColorSwatch[]

    // ---- File ----
    storedName?: string
    originalName?: string
    fileSize?: number
    fileExt?: string

    // ---- 共用狀態 ----
    state: CardState
    preview?: boolean

    // ---- 卡片屬性 ----
    tags?: string[] | null
    cardStatus?: CardStatusType | null
    priority?: PriorityType | null
}

export type TLCardShape = TLBaseShape<'card', TLCardProps>