// src/components/card-shape/sub-components/SuggestPopup.tsx
//
// `/` 選單與 `[[` 補全共用的下拉外殼（定位／配色）。獨立成檔是為了讓 EditorMenus.tsx 只匯出 hook
// （react-refresh 的規則：同一檔案不能同時有元件與非元件匯出）。
// position:fixed ＋ Z_MODAL：卡片會裁切內容、復盤中心是全螢幕面板，下拉都得浮在最上層。

import { Z_MODAL } from '../../../constants'
import { T } from '../../../theme/tokens'

/** 補全下拉的共用外殼（`[[]]` 與 `/` 兩處共用，避免複製一份定位/配色） */
export function SuggestPopup({
    coords, footer, children,
}: {
    coords: { x: number; y: number }
    footer: string
    children: React.ReactNode
}) {
    return (
        <div
            // 標記給外層 modal 的 capture Esc 看：選單開著時 Esc 要讓給選單（RC18）
            data-editor-menu=""
            onPointerDown={(e) => e.preventDefault()}
            style={{
                position: 'fixed',
                left: coords.x,
                top: coords.y,
                zIndex: Z_MODAL,
                background: T.bgPanel,
                border: `1px solid ${T.borderLight}`,
                borderRadius: 8,
                boxShadow: T.shadowMd,
                minWidth: 180,
                maxWidth: 280,
                maxHeight: 320,
                overflowY: 'auto',
                fontSize: 13,
            }}
        >
            {children}
            <div style={{
                padding: '3px 12px', fontSize: 10,
                color: T.textMuted,
                borderTop: `1px solid ${T.borderLight}`,
                background: T.bgApp,
                position: 'sticky', bottom: 0,
            }}>
                {footer}
            </div>
        </div>
    )
}
