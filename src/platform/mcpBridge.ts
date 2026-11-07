// src/platform/mcpBridge.ts
//
// 主視窗與 main process 之間的 Claude Code（MCP）接縫（同 desktopBridge.ts）。
// web/PWA 沒有 electronAPI：一律 no-op。

import type { McpRequest, McpResult } from '../utils/mcpTools'

/** 訂閱 main 轉來的請求；回傳 unsubscribe */
export function onMcpRequest(callback: (req: McpRequest) => void): () => void {
    return window.electronAPI?.onMcpRequest?.(callback) ?? (() => {})
}

export function sendMcpResponse(id: string, result: McpResult): void {
    window.electronAPI?.sendMcpResponse?.(id, result)
}

export function setMcpReady(ready: boolean): void {
    window.electronAPI?.setMcpReady?.(ready)
}
