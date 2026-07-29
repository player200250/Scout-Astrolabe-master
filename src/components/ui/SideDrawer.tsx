// src/components/ui/SideDrawer.tsx — 右側輔助抽屜（A2 面板樣式統一）
//
// 統一前：任務中心 340／標籤管理 340／篩選 320／雲端同步 420／備份 320 五種寬度，
// 三種寫法（height:'100vh' vs bottom:0）、兩種陰影（硬編碼 vs token）、關閉鈕各自實作。
// 使用者每開一個面板都要重新找「多大、怎麼關」。
//
// 統一後只有兩級寬度：
//   list（360）＝清單類（任務中心／標籤／篩選）
//   form（440）＝表單類（雲端同步有網址與金鑰輸入框，360 會擠）
// 硬收成一種反而讓表單難用，所以是兩級而不是一級。
import type { ReactNode } from 'react'
import { Z_PANEL } from '../../constants'
import { T } from '../../theme/tokens'

export type DrawerWidth = 'list' | 'form'

const DRAWER_WIDTH: Record<DrawerWidth, number> = { list: 360, form: 440 }

export interface SideDrawerProps {
    title: ReactNode
    /** 標題右邊的小標，例如「3 逾期」 */
    badge?: ReactNode
    width?: DrawerWidth
    /**
     * 距離右邊界的距離。備份面板要避開側邊欄（右側欄寬），其餘一律貼齊 0。
     */
    offsetRight?: number
    onClose: () => void
    /** 標題列右側、關閉鈕之前的動作（例如「清除篩選」） */
    headerActions?: ReactNode
    /** 標題列下方的固定區塊（分頁列、搜尋框…），不隨內容捲動 */
    headerExtra?: ReactNode
    /** 底部固定區塊（統計列…） */
    footer?: ReactNode
    /** 內容區左右內距，預設 16 */
    bodyPadding?: number | string
    children: ReactNode
}

export function SideDrawer({
    title, badge, width = 'list', offsetRight = 0,
    onClose, headerActions, headerExtra, footer, bodyPadding = 16, children,
}: SideDrawerProps) {
    return (
        <div style={{
            position: 'fixed', top: 0, right: offsetRight, bottom: 0,
            width: DRAWER_WIDTH[width], maxWidth: '92vw',
            background: T.bgPanel, backdropFilter: 'blur(12px)',
            borderLeft: `1px solid ${T.borderLight}`,
            boxShadow: T.shadowPanel, zIndex: Z_PANEL,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '14px 16px 10px', flexShrink: 0,
                borderBottom: headerExtra ? 'none' : `1px solid ${T.borderLight}`,
            }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary }}>{title}</span>
                {badge}
                <div style={{ flex: 1 }} />
                {headerActions}
                <DrawerCloseButton onClose={onClose} />
            </div>

            {headerExtra && (
                <div style={{
                    padding: '0 16px 10px', flexShrink: 0,
                    borderBottom: `1px solid ${T.borderLight}`,
                }}>{headerExtra}</div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: bodyPadding }}>{children}</div>

            {footer && (
                <div style={{
                    flexShrink: 0, borderTop: `1px solid ${T.borderLight}`,
                    padding: '8px 14px',
                }}>{footer}</div>
            )}
        </div>
    )
}

/** 關閉鈕：位置與樣式固定在右上角，是「怎麼關」這件事一致的關鍵 */
export function DrawerCloseButton({ onClose }: { onClose: () => void }) {
    return (
        <button
            onClick={onClose}
            aria-label="關閉"
            style={{
                width: 28, height: 28, borderRadius: 8, padding: 0,
                border: `1px solid ${T.borderLight}`, background: 'transparent',
                cursor: 'pointer', fontSize: 14, color: T.textMuted,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = T.bgHover)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >✕</button>
    )
}
