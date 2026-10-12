// src/utils/desktopLayoutRules.test.ts — Desktop 排列在 main process 端的規則（根目錄 desktopLayoutRules.js）
import { describe, it, expect } from 'vitest'
import { sanitizeStoredLayout, layoutRows, minHeightForRows, grownBounds, GROW_HEIGHT_3_ROWS } from '../../desktopLayoutRules.js'

describe('sanitizeStoredLayout', () => {
    it('合格的原樣收下', () => {
        expect(sanitizeStoredLayout({ order: ['clock', 'quick-note'], hidden: ['clock'], extra: 1 }))
            .toEqual({ version: 1, order: ['clock', 'quick-note'], hidden: ['clock'] })
    })

    it('格式不對一律拒絕', () => {
        expect(sanitizeStoredLayout(null)).toBeNull()
        expect(sanitizeStoredLayout({ order: ['clock'] })).toBeNull()
        expect(sanitizeStoredLayout({ order: 'clock', hidden: [] })).toBeNull()
        expect(sanitizeStoredLayout({ order: [1], hidden: [] })).toBeNull()
        expect(sanitizeStoredLayout({ order: ['<script>'], hidden: [] })).toBeNull()
        expect(sanitizeStoredLayout({ order: ['a'.repeat(41)], hidden: [] })).toBeNull()
        expect(sanitizeStoredLayout({ order: Array(21).fill('clock'), hidden: [] })).toBeNull()
    })
})

describe('列數與最小高度', () => {
    it('兩張一列，1～3 列；沒存過＝2 列', () => {
        expect(layoutRows(null)).toBe(2)
        const l = (n: number, hide = 0) => ({ version: 1 as const, order: Array.from({ length: n }, (_, i) => `c${'abcdefgh'[i]}`), hidden: Array.from({ length: hide }, (_, i) => `c${'abcdefgh'[i]}`) })
        expect(layoutRows(l(4))).toBe(2)
        expect(layoutRows(l(4, 3))).toBe(1)
        expect(layoutRows(l(5))).toBe(3)
        expect(layoutRows(l(8))).toBe(3)
    })

    it('3 列的最小高度比較高', () => {
        expect(minHeightForRows(2)).toBe(420)
        expect(minHeightForRows(3)).toBeGreaterThan(minHeightForRows(2))
    })
})

describe('grownBounds', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 }
    const win = { x: 100, y: 100, width: 560, height: 480 }

    it('2 列 → 3 列：加高到預設高度', () => {
        expect(grownBounds(win, area, 2, 3)).toEqual({ ...win, height: GROW_HEIGHT_3_ROWS })
    })

    it('本來就夠高、本來就是 3 列、變成 2 列：不動', () => {
        expect(grownBounds({ ...win, height: 800 }, area, 2, 3)).toBeNull()
        expect(grownBounds(win, area, 3, 3)).toBeNull()
        expect(grownBounds(win, area, 3, 2)).toBeNull()
    })

    it('底部會超出工作區就往上移', () => {
        expect(grownBounds({ ...win, y: 600 }, area, 2, 3)).toEqual({ ...win, y: 1040 - 700, height: 700 })
    })

    it('工作區比預設高度還矮：只長到工作區高度', () => {
        const small = { x: 0, y: 0, width: 1366, height: 600 }
        expect(grownBounds(win, small, 2, 3)).toEqual({ ...win, y: 0, height: 600 })
    })
})
