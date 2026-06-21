// src/CardShape.ts
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

export const CARD_COLORS: Record<CardColor, { bg: string; accent: string; label: string }> = {
    none:   { bg: '#ffffff', accent: '#e0e0e0', label: '無' },
    red:    { bg: '#fff5f5', accent: '#ff4d4f', label: '紅' },
    orange: { bg: '#fff7f0', accent: '#ff7a00', label: '橙' },
    yellow: { bg: '#fffbe6', accent: '#facc15', label: '黃' },
    green:  { bg: '#f0fff4', accent: '#22c55e', label: '綠' },
    blue:   { bg: '#eff6ff', accent: '#3b82f6', label: '藍' },
    purple: { bg: '#faf5ff', accent: '#a855f7', label: '紫' },
    pink:   { bg: '#fdf2f8', accent: '#ec4899', label: '粉' },
    dark:   { bg: '#1a1a2e', accent: '#6366f1', label: '深' },
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