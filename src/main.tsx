import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { RootErrorFallback } from './components/RootErrorFallback'

// ── 全域錯誤浮層 ───────────────────────────────────────────────────────────────
// ErrorBoundary 只抓得到 render 階段的同步錯誤；非同步錯誤（setTimeout/promise）、
// 以及 React 掛載前的模組載入錯誤都抓不到，這類會造成「無聲白屏」。
// 這裡用原生 error / unhandledrejection 監聽，把任何錯誤直接畫到畫面上（蓋過白屏），
// 讓使用者即使在無 DevTools 的打包版也看得到錯誤訊息以便回報。
function showGlobalError(title: string, detail: string) {
    let box = document.getElementById('__global_error_overlay__')
    if (!box) {
        box = document.createElement('div')
        box.id = '__global_error_overlay__'
        box.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:2147483647',
            'background:#fff', 'color:#1a1a1a', 'padding:24px',
            'font-family:monospace', 'font-size:13px', 'overflow:auto',
            'white-space:pre-wrap', 'word-break:break-all',
        ].join(';')
        document.body.appendChild(box)
    }
    box.textContent = `⚠️ ${title}\n\n${detail}\n\n（請把這段訊息回報給開發者）`
}

window.addEventListener('error', (e) => {
    showGlobalError('應用程式錯誤 (error)', `${e.message}\n${e.error?.stack ?? ''}`)
})
window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    showGlobalError('未處理的 Promise 錯誤 (unhandledrejection)',
        reason?.stack ?? reason?.message ?? String(reason))
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary name="應用程式" fallback={RootErrorFallback}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
