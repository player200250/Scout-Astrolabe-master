/**
 * 顏色樣本卡（color swatch）相關 utility 函式
 */

/**
 * 根據背景色亮度回傳黑或白前景色，確保對比度可讀。
 * 使用 WCAG 相對亮度公式（Rec. 601 近似）。
 */
export function getContrastColor(hex: string): '#000000' | '#ffffff' {
    const clean = hex.replace('#', '')
    if (clean.length !== 6) return '#000000'
    const r = parseInt(clean.slice(0, 2), 16)
    const g = parseInt(clean.slice(2, 4), 16)
    const b = parseInt(clean.slice(4, 6), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#000000' : '#ffffff'
}
