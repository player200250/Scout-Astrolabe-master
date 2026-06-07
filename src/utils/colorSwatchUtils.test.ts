// src/utils/colorSwatchUtils.test.ts
import { describe, it, expect } from 'vitest'
import { getContrastColor } from './colorSwatchUtils'

describe('getContrastColor', () => {
    it('深色背景回傳白色前景', () => {
        expect(getContrastColor('#000000')).toBe('#ffffff') // 純黑
        expect(getContrastColor('#1e293b')).toBe('#ffffff') // 深藍灰
    })

    it('淺色背景回傳黑色前景', () => {
        expect(getContrastColor('#ffffff')).toBe('#000000') // 純白
        expect(getContrastColor('#ffff00')).toBe('#000000') // 亮黃（亮度高）
    })

    it('不帶 # 前綴也能解析', () => {
        expect(getContrastColor('000000')).toBe('#ffffff')
        expect(getContrastColor('ffffff')).toBe('#000000')
    })

    it('綠色比紅、藍佔更重的亮度權重（Rec.601）', () => {
        // 純綠 #00ff00 亮度 0.587 > 0.5 → 黑字
        expect(getContrastColor('#00ff00')).toBe('#000000')
        // 純藍 #0000ff 亮度 0.114 < 0.5 → 白字
        expect(getContrastColor('#0000ff')).toBe('#ffffff')
    })

    it('長度不合法的輸入回傳預設黑色（防呆）', () => {
        expect(getContrastColor('#fff')).toBe('#000000')   // 3 碼縮寫不支援
        expect(getContrastColor('')).toBe('#000000')        // 空字串
        expect(getContrastColor('#12345')).toBe('#000000')  // 5 碼
    })
})
