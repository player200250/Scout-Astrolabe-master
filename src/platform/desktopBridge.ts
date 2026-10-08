// src/platform/desktopBridge.ts
//
// 主視窗 ↔ Scout Desktop 的平台薄接縫（比照 quickCapture.ts）。
// web/PWA 沒有 Desktop 視窗：發布是 no-op、訂閱回 no-op unsubscribe。

import type { DesktopCommand, DesktopSummary } from '../utils/desktopSummary'

export function publishDesktopSummary(summary: DesktopSummary): void {
    window.electronAPI?.publishDesktopSummary?.(summary)
}

/** 這個環境能不能開 Scout Desktop（PWA 不行 ⇒ 側邊欄與命令面板不顯示入口） */
export function canToggleDesktop(): boolean {
    return typeof window !== 'undefined' && !!window.electronAPI?.toggleDesktop
}

export function toggleDesktopWindow(): Promise<boolean> {
    return window.electronAPI?.toggleDesktop?.() ?? Promise.resolve(false)
}

/** 目前狀態＋之後的變化（托盤、快捷鍵、Desktop 自己的 ✕ 都會通知）；回傳 unsubscribe */
export function watchDesktopOpen(callback: (open: boolean) => void): () => void {
    const api = window.electronAPI
    if (!api?.onDesktopOpenChanged) return () => {}
    let pushed = false
    const off = api.onDesktopOpenChanged(open => { pushed = true; callback(open) })
    api.isDesktopOpen?.().then(open => { if (!pushed) callback(open) }).catch(() => {})
    return off
}

/** 訂閱 Desktop 轉來的指令，回傳 unsubscribe（永遠可呼叫） */
export function onDesktopCommand(callback: (cmd: DesktopCommand) => void): () => void {
    return window.electronAPI?.onDesktopCommand?.(callback) ?? (() => {})
}
