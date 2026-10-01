// src/components/card-shape/type/CardShape.test.ts
//
// 卡片底色（2026-10-01）：夜間模式套色原本是「日間淺底＋主題淺灰字」，對比 1.33:1。
// 這裡把驗收標準寫成測試——之後誰改了色值，夜間字讀不讀得到會直接被擋下。
import { describe, it, expect } from 'vitest'
import { CARD_COLORS, cardBackground, type CardColor } from './CardShape'
import { T } from '../../../theme/tokens'

const DARK_TEXT = '#e2e8f0' // tokens.css 夜間 --text-primary

function luminance(hex: string): number {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
}

const TINTED: CardColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink']

describe('cardBackground', () => {
    it('日間維持原本的淺底（數值不變）', () => {
        for (const c of TINTED) expect(cardBackground(c, false)).toBe(CARD_COLORS[c].bg)
        expect(cardBackground('orange', false)).toBe('#fff7f0')
    })

    it('夜間改用 darkBg', () => {
        for (const c of TINTED) expect(cardBackground(c, true)).toBe(CARD_COLORS[c].darkBg)
    })

    it('無色跟著主題 token；深色卡日夜都是深底', () => {
        expect(cardBackground('none', true)).toBe(T.bgCard)
        expect(cardBackground(undefined, false)).toBe(T.bgCard)
        expect(cardBackground('dark', false)).toBe('#1a1a2e')
        expect(cardBackground('dark', true)).toBe('#1a1a2e')
    })

    it('夜間每個顏色對主題字色的對比 ≥ 7:1', () => {
        for (const c of TINTED) expect(contrast(CARD_COLORS[c].darkBg, DARK_TEXT)).toBeGreaterThanOrEqual(7)
    })
})
