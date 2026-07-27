// src/utils/toast.ts
// 非阻塞通知的發送端（TD9）。渲染端是 components/ui/ToastHost.tsx（由 App 掛載一次）。
//
// 為什麼取代 alert()：alert 會**阻塞整個 renderer**（畫面凍住、動畫停格、tldraw 收不到事件），
// 而且長得像系統錯誤、樣式不受控。實務上這些訊息九成是「做完了」或「這個操作沒東西可做」，
// 不需要使用者按確定。
//
// 用法（任何地方都可以，不限元件內）：
//   showToast('已匯出 PNG')                    // info
//   showToast('已存為模板', 'success')
//   showToast('匯入失敗，檔案格式錯誤', 'error')
//
// 需要使用者做決定時可以帶一顆動作鈕、並讓它不要自動消失（S0(b) 的同步衝突提示就是這樣用）：
//   showToast('雲端有較新版本', 'info', {
//       action: { label: '立即載入', run: () => void applyRemote() },
//       durationMs: null,
//   })
import { emitAppEvent } from './appEvents'

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastOptions {
    /** 動作鈕；按下後 toast 會自動關閉 */
    action?: { label: string; run: () => void }
    /** 自訂顯示時間（毫秒）；傳 null＝不自動消失，只能由使用者關掉 */
    durationMs?: number | null
}

export function showToast(message: string, kind: ToastKind = 'info', options: ToastOptions = {}): void {
    emitAppEvent('ui-toast', { message, kind, ...options })
}
