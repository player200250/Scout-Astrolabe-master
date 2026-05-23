// src/utils/whiteboardUtils.ts
// 白板工具列相關 utilities（從 WhiteboardTools.tsx 拆出）

import type React from 'react'

/** 依 dark mode 回傳白板右上角按鈕的通用樣式 */
export const getExportBtnStyle = (isDark: boolean): React.CSSProperties => ({
    padding: '5px 11px',
    fontSize: 12,
    fontWeight: 500,
    color: isDark ? '#e2e8f0' : '#333',
    background: isDark ? 'rgba(30,41,59,0.92)' : 'rgba(255,255,255,0.92)',
    border: isDark ? '1px solid #475569' : '1px solid #e0e0e0',
    borderRadius: 8,
    cursor: 'pointer',
    backdropFilter: 'blur(4px)',
    boxShadow: isDark ? '0 1px 4px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.08)',
    transition: 'background 0.15s',
    whiteSpace: 'nowrap' as const,
})

/** @deprecated 請改用 getExportBtnStyle(isDark) */
export const exportBtnStyle: React.CSSProperties = getExportBtnStyle(false)
