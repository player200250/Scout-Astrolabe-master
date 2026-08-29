// src/hooks/useGlobalHotkeys.ts
//
// TD1 步驟 4 — 把 App.tsx 那串全域快捷鍵 keydown effect 抽出來。
// 原本是 10 個長得幾乎一樣的 if（各自重複 `(e.metaKey || e.ctrlKey) && …` 與 preventDefault），
// 改成「一張對照表 + 一個純函式比對」：
//   - 要加一個快捷鍵＝在 HOTKEYS 加一列，不必再複製 if
//   - `matchHotkey` 是純函式，測試直接餵假事件物件，不必進 jsdom 也不必真的按鍵
//
// ⚠️ 判斷條件與原本逐字一致，不順手「修正」：
//   - 帶 Shift 的組合**不檢查 altKey**（原本就沒查）
//   - 不帶 Shift 的組合則要求「沒按 Shift 也沒按 Alt」
//   改動這些等於偷偷改行為，屬另一件事。
import { useEffect } from 'react'
import type { PanelName } from './usePanelState'

export type HotkeyAction =
    | { type: 'toggle'; panel: PanelName }
    | { type: 'open'; panel: PanelName }
    | { type: 'goToInbox' }

export interface HotkeyBinding {
    /** 與 `e.key.toLowerCase()` 比對 */
    key: string
    /** true＝必須按著 Shift；false＝必須沒按 Shift、也沒按 Alt */
    shift: boolean
    action: HotkeyAction
}

/** Ctrl（或 ⌘）為所有組合的共同前綴，故不寫在表裡。 */
export const HOTKEYS: readonly HotkeyBinding[] = [
    { key: 'o', shift: true, action: { type: 'toggle', panel: 'overview' } },
    { key: 'c', shift: true, action: { type: 'toggle', panel: 'reviewCenter' } },
    { key: 'i', shift: true, action: { type: 'goToInbox' } },
    { key: 'g', shift: true, action: { type: 'toggle', panel: 'knowledgeGraph' } },
    { key: 'l', shift: true, action: { type: 'toggle', panel: 'cardLibrary' } },
    { key: 't', shift: true, action: { type: 'toggle', panel: 'trash' } },
    { key: 'e', shift: true, action: { type: 'toggle', panel: 'inboxTriage' } },
    { key: ' ', shift: false, action: { type: 'toggle', panel: 'quickCapture' } },
    { key: 'p', shift: false, action: { type: 'open', panel: 'quickSwitcher' } },
    { key: 'k', shift: false, action: { type: 'toggle', panel: 'commandPalette' } },
]

/** KeyboardEvent 只取比對用得到的欄位，測試才不必造完整事件。 */
export interface HotkeyEventLike {
    key: string
    ctrlKey: boolean
    metaKey: boolean
    shiftKey: boolean
    altKey: boolean
}

export function matchHotkey(e: HotkeyEventLike): HotkeyAction | null {
    if (!e.ctrlKey && !e.metaKey) return null
    const key = e.key.toLowerCase()
    for (const binding of HOTKEYS) {
        if (binding.key !== key) continue
        if (binding.shift ? !e.shiftKey : (e.shiftKey || e.altKey)) continue
        return binding.action
    }
    return null
}

export interface UseGlobalHotkeysActions {
    openPanel: (name: PanelName) => void
    togglePanel: (name: PanelName) => void
    goToInbox: () => void
}

export function useGlobalHotkeys({ openPanel, togglePanel, goToInbox }: UseGlobalHotkeysActions): void {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const action = matchHotkey(e)
            if (!action) return
            e.preventDefault()
            if (action.type === 'goToInbox') goToInbox()
            else if (action.type === 'open') openPanel(action.panel)
            else togglePanel(action.panel)
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [openPanel, togglePanel, goToInbox])
}
