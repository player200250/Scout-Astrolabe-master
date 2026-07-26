// src/theme/ThemeContext.tsx
// 明暗模式的唯一 React 來源（TD8）。
//
// 絕大多數元件在 token 化之後**不需要知道**現在是不是暗色——顏色交給 tokens.css
// 依 <html data-theme> 決定即可（見 tokens.ts）。只有少數地方真的需要那個布林值：
//   - 主題切換鈕本身（要顯示 ☀️ / 🌙）
//   - 以動態色計算的半透明標籤（hexToRgba(色, isDark ? 0.22 : 0.12)）——底色隨卡片標籤而變，
//     不是固定 token 表達得了的
//   - tldraw 的 colorScheme 偏好設定
// 這些改用 useIsDark() 直接取，不必再讓中間十幾個元件層層傳 isDark prop。
//
// 註：畫布內的卡片元件（card-shape/*）用的是 tldraw 自己的 useIsDarkMode()，
// 因為它們活在 editor context 裡，與這個 context 平行、互不影響。
import { createContext, useContext } from 'react'

const ThemeContext = createContext(false)

export const ThemeProvider = ThemeContext.Provider

/** 目前是否為暗色模式。無 Provider 時回傳 false（測試可直接 render 不必包）。 */
export function useIsDark(): boolean {
    return useContext(ThemeContext)
}
