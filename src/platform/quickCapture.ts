// src/platform/quickCapture.ts
//
// 「托盤／全域熱鍵觸發快速捕捉」的平台薄接縫（roadmap-mobile S0(a) 的 src/platform/ 接縫之一）。
// 桌面（N3）：托盤選單「快速捕捉」／全域熱鍵 Ctrl+Shift+Space → 主程序送 trigger-quick-capture。
// 回傳 unsubscribe 供 React effect cleanup（否則 effect 重跑會疊 listener）。
// web/PWA 無托盤/全域熱鍵：回一個 no-op unsubscribe，呼叫端 effect cleanup 照常運作。
// 比照 imageStore.ts / linkOpener.ts / linkPreview.ts / fileStore.ts / documentIO.ts。

/**
 * 訂閱「托盤／全域熱鍵觸發快速捕捉」事件，回傳 unsubscribe。
 * 非 Electron 環境回 no-op unsubscribe（永遠回傳可呼叫的 cleanup 函式）。
 */
export function onTriggerQuickCapture(callback: () => void): () => void {
    return window.electronAPI?.onTriggerQuickCapture?.(callback) ?? (() => {})
}
