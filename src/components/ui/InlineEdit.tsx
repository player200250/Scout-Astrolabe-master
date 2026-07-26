// src/components/ui/InlineEdit.tsx
// 就地改名輸入框（TD9）。取代 BoardTabBar／BoardOverview／TagManager 各自重造的那份。
//
// 這些自製版本的行為本來就一樣（autoFocus、Enter 送出、Escape 取消、失焦送出、
// 擋住事件冒泡避免被 tldraw／側邊欄的全域快捷鍵吃掉），只有外觀與驗證不同，
// 所以樣式用 style prop 傳入，其餘行為由本元件統一。
import { useState } from 'react'
import { T } from '../../theme/tokens'

interface InlineEditProps {
    /** 初始值（進入編輯狀態當下的名稱）*/
    value: string
    /** 按 Enter 或失焦時呼叫。由呼叫端決定要不要接受這個值 */
    onCommit: (value: string) => void
    /** 按 Escape 時呼叫 */
    onCancel: () => void
    /** 每次輸入變動時通知（給「旁邊還有一顆送出鈕」或要即時清錯誤訊息的情境用；
     *  一般改名不需要——值由本元件自己保管，onCommit 時一併給） */
    onChange?: (value: string) => void
    /** 失焦是否等同送出。預設 true；驗證型的欄位（TagManager）要關掉，
     *  否則錯誤訊息還沒看到就被 blur 送出了 */
    commitOnBlur?: boolean
    /** 進入時是否全選（方便直接覆寫）。預設 false＝維持既有行為：游標落在尾端 */
    selectOnFocus?: boolean
    /** 每個使用處的視覺差異（底線式 vs 外框式）由這裡傳 */
    style?: React.CSSProperties
    placeholder?: string
    /** 有錯誤時（例如標籤名重複）外框轉紅 */
    hasError?: boolean
}

export function InlineEdit({
    value: initialValue,
    onCommit,
    onCancel,
    onChange,
    commitOnBlur = true,
    selectOnFocus = false,
    style,
    placeholder,
    hasError = false,
}: InlineEditProps) {
    const [value, setValue] = useState(initialValue)

    return (
        <input
            autoFocus
            value={value}
            placeholder={placeholder}
            onFocus={selectOnFocus ? e => e.currentTarget.select() : undefined}
            onChange={e => { setValue(e.target.value); onChange?.(e.target.value) }}
            onBlur={commitOnBlur ? () => onCommit(value) : undefined}
            onKeyDown={e => {
                // 一律擋下冒泡：這些輸入框常長在 tldraw 畫布或側邊欄裡，
                // 不擋的話 Escape/單鍵快捷鍵會被上層攔走（見記憶 arch_three_event_systems）
                e.stopPropagation()
                if (e.key === 'Enter') { e.preventDefault(); onCommit(value) }
                if (e.key === 'Escape') { e.preventDefault(); onCancel() }
            }}
            onClick={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
            style={{
                outline: 'none',
                background: 'transparent',
                color: T.textPrimary,
                fontFamily: 'inherit',
                ...style,
                ...(hasError ? { borderColor: T.danger } : null),
            }}
        />
    )
}
