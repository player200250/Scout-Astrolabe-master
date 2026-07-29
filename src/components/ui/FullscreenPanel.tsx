// src/components/ui/FullscreenPanel.tsx — 全螢幕內容面板（A2 面板樣式統一）
//
// 統一前：卡片庫／復盤中心／白板總覽／資料安全／垃圾桶各自寫 `position:fixed; inset:0`，
// z-index 有 20000 也有 50000（硬編碼），有的加 backdropFilter 有的沒有，
// header 高度與關閉鈕位置也各不相同。
//
// header 版位固定為：[標題] [小標] [中間內容（搜尋框等，flex:1）] [右側動作] [✕]
// 關閉鈕永遠在最右——「怎麼關」不該每個面板都要重新找。
import type { ReactNode } from 'react'
import { Z_FULLSCREEN_PANEL, Z_FULLSCREEN_PANEL_ABOVE } from '../../constants'
import { T } from '../../theme/tokens'

export interface FullscreenPanelProps {
    title: ReactNode
    /** 標題右邊的小標，例如「12 / 340」或「統計與備份設定」 */
    badge?: ReactNode
    /** header 中段，會撐開（搜尋框、分頁列…） */
    headerContent?: ReactNode
    /** header 右段，關閉鈕之前（工具按鈕群） */
    headerActions?: ReactNode
    onClose: () => void
    /**
     * 疊在其他全螢幕面板之上。目前只有垃圾桶用（它原本就寫死 50000）——
     * 統一時刻意保留這個層級差，避免默默改變既有的疊放行為。
     */
    elevated?: boolean
    /** 標題列下方的固定區塊（分頁列等），不隨內容捲動 */
    subHeader?: ReactNode
    /** 內容區是否要留白邊，預設 true；圖譜這類要滿版畫布的傳 false */
    padded?: boolean
    children: ReactNode
}

export function FullscreenPanel({
    title, badge, headerContent, headerActions, onClose,
    subHeader, elevated = false, padded = true, children,
}: FullscreenPanelProps) {
    return (
        <div style={{
            position: 'fixed', inset: 0,
            zIndex: elevated ? Z_FULLSCREEN_PANEL_ABOVE : Z_FULLSCREEN_PANEL,
            background: T.bgPanel, backdropFilter: 'blur(12px)',
            display: 'flex', flexDirection: 'column',
        }}>
            <div style={{
                height: 54, flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px',
                background: T.bgSidebar,
                borderBottom: `1px solid ${T.borderLight}`,
                boxShadow: T.shadowHairline,
            }}>
                <span style={{
                    fontSize: 16, fontWeight: 700, color: T.textPrimary,
                    flexShrink: 0, userSelect: 'none',
                }}>{title}</span>
                {badge && (
                    <span style={{ fontSize: 12, color: T.textMuted, flexShrink: 0 }}>{badge}</span>
                )}
                {headerContent
                    ? <div style={{ flex: 1, minWidth: 0 }}>{headerContent}</div>
                    : <div style={{ flex: 1 }} />}
                {headerActions}
                <PanelCloseButton onClose={onClose} />
            </div>

            {subHeader && <div style={{ flexShrink: 0 }}>{subHeader}</div>}

            <div style={{ flex: 1, overflowY: 'auto', padding: padded ? 20 : 0 }}>{children}</div>
        </div>
    )
}

/** 關閉鈕：全螢幕面板一律放在 header 最右側 */
export function PanelCloseButton({ onClose }: { onClose: () => void }) {
    return (
        <button
            onClick={onClose}
            aria-label="關閉"
            style={{
                width: 30, height: 30, borderRadius: 8, padding: 0, flexShrink: 0,
                border: `1px solid ${T.borderLight}`, background: 'transparent',
                cursor: 'pointer', fontSize: 15, color: T.textSecondary,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = T.bgHover)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >✕</button>
    )
}
