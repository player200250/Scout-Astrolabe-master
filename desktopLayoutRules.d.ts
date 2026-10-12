// desktopLayoutRules.js 的型別宣告（main.js 是純 JS；給 src/ 裡的 TS 測試用）
export interface StoredDesktopLayout { version: 1; order: string[]; hidden: string[] }
interface Rect { x: number; y: number; width: number; height: number }
export declare const LAYOUT_ID_MAX: number
export declare const LAYOUT_LIST_MAX: number
export declare const MIN_HEIGHT_BY_ROWS: Record<number, number>
export declare const GROW_HEIGHT_3_ROWS: number
export declare function sanitizeStoredLayout(raw: unknown): StoredDesktopLayout | null
export declare function layoutRows(layout: StoredDesktopLayout | null): number
export declare function minHeightForRows(rows: number): number
export declare function grownBounds(bounds: Rect, workArea: Rect, prevRows: number, nextRows: number): Rect | null
