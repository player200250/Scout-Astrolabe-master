// src/utils/whiteboardUtils.ts
// 白板工具列相關 utilities（從 WhiteboardTools.tsx 拆出）

import type React from 'react'
import { T } from '../theme/tokens'

/** 白板右上角按鈕的通用樣式。
 *  TD8 後色值全走 design token（由 <html data-theme> 決定明暗），
 *  故不再需要 isDark 參數——原本的 getExportBtnStyle(isDark) 已收斂成這個常數。 */
export const exportBtnStyle: React.CSSProperties = {
    padding: '5px 11px',
    fontSize: 12,
    fontWeight: 500,
    color: T.textPrimary,
    background: T.bgOverlay,
    border: `1px solid ${T.borderLight}`,
    borderRadius: 8,
    cursor: 'pointer',
    backdropFilter: 'blur(4px)',
    boxShadow: T.shadowSm,
    transition: 'background 0.15s',
    whiteSpace: 'nowrap' as const,
}
