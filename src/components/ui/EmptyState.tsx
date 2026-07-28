import React from 'react'
import { T } from '../../theme/tokens'

/**
 * 共用空狀態（ux-audit A4）。
 *
 * 自用工具的空狀態就是最常看到的畫面（統計格常年 0），原本各處只用灰字陳述
 * 「沒有 X」，看的人不知道下一步該做什麼。這個元件統一成
 * 「說明現況 → 給下一步」：`title` 講現況，`hint` 講怎麼讓它有東西，
 * `actionLabel`＋`onAction` 是可直接按的入口（沒有真入口就別給，只留 hint）。
 *
 * `compact` 給塞在既有卡片區塊裡的小空位用（不放大 icon、不撐高度）。
 */
export interface EmptyStateProps {
    /** emoji 圖示；compact 模式會忽略 */
    icon?: string
    /** 現況一句話 */
    title: string
    /** 下一步提示；沒有可按的入口時，這裡就是唯一的引導 */
    hint?: string
    /** 有真的入口才給，否則留空 */
    actionLabel?: string
    onAction?: () => void
    /** 塞在既有區塊裡的小空位 */
    compact?: boolean
}

export function EmptyState({ icon, title, hint, actionLabel, onAction, compact }: EmptyStateProps) {
    const actionBtn: React.CSSProperties = {
        marginTop: compact ? 8 : 12,
        padding: compact ? '5px 12px' : '7px 16px',
        borderRadius: 8,
        border: `1px solid ${T.borderLight}`,
        background: 'transparent',
        color: T.accent,
        cursor: 'pointer',
        fontSize: compact ? 12 : 13,
        fontWeight: 500,
    }

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: compact ? 'flex-start' : 'center',
            justifyContent: 'center', textAlign: compact ? 'left' : 'center',
            padding: compact ? 0 : '40px 16px',
            gap: 4,
        }}>
            {!compact && icon && <span style={{ fontSize: 36, opacity: 0.7, marginBottom: 4 }}>{icon}</span>}
            <div style={{ fontSize: compact ? 13 : 14, color: T.textSecondary }}>{title}</div>
            {hint && (
                <div style={{ fontSize: compact ? 12 : 13, color: T.textMuted, lineHeight: 1.6, maxWidth: 360 }}>
                    {hint}
                </div>
            )}
            {actionLabel && onAction && (
                <button style={actionBtn} onClick={onAction}>{actionLabel}</button>
            )}
        </div>
    )
}
