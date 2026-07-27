// src/mobile/main.tsx — 手機速記 PWA 的進入點（S1）
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MobileApp } from './MobileApp'
import './mobile.css'

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <MobileApp />
    </StrictMode>,
)

// Service worker：讓 App 加到主畫面後即使沒訊號也打得開。
// 沒有它的話，離線時開啟只會看到瀏覽器的恐龍頁，outbox 裡的東西也就補不了。
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.warn('[pwa] service worker 註冊失敗（不影響線上使用）', err)
        })
    })
}
