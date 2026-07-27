// src/mobile/sw.ts — 手機速記 PWA 的 service worker（S1）
//
// 做兩件事：
//   1. **離線也打得開**：快取 app shell。速記存在 IndexedDB 等著補送，
//      但如果離線時連畫面都開不起來，使用者連「再記一筆」都做不到。
//   2. **背景補送**：Background Sync。App 沒開著、連線恢復時，瀏覽器會喚醒這支
//      service worker 把 outbox 送出去（Android Chrome；iOS Safari 不支援，
//      那邊靠頁面「回到前台就補送」）。
//
// ⚠️ 這支檔案由 Vite 單獨打包成**自足的 IIFE**（vite.config.sw.ts），
// 所以可以直接 import 共用的建卡邏輯。若改成手寫 sw.js 就得複製一份
// appendQuickCaptureCard——那正是「手機記的卡跟桌機長得不一樣」這類漂移的來源。
//
// 型別說明：專案的 tsconfig 用的是 DOM lib，裡面沒有 ServiceWorkerGlobalScope／
// FetchEvent／SyncEvent，混進 webworker lib 又會與 DOM 衝突，因此下面自己描述
// 需要的那一小塊介面。
import { flushOutboxCore } from './mobileSyncCore'
import { BACKGROUND_SYNC_TAG } from './mobileCapture'

interface ExtendableEventLike {
    waitUntil(promise: Promise<unknown>): void
}
interface FetchEventLike extends ExtendableEventLike {
    request: Request
    respondWith(response: Response | Promise<Response>): void
}
interface SyncEventLike extends ExtendableEventLike {
    tag: string
}
interface ServiceWorkerScope {
    addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEventLike) => void): void
    addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void
    addEventListener(type: 'sync', listener: (event: SyncEventLike) => void): void
    skipWaiting(): Promise<void>
    clients: { claim(): Promise<void> }
    location: { origin: string }
}

declare const self: ServiceWorkerScope

const CACHE = 'astrolabe-mobile-v2'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png']

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE)
            // 個別失敗不該讓整個安裝失敗（例如某個圖示暫時取不到）
            .then(cache => Promise.allSettled(SHELL.map(url => cache.add(url))))
            .then(() => self.skipWaiting()),
    )
})

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim()),
    )
})

self.addEventListener('fetch', event => {
    const { request } = event
    if (request.method !== 'GET') return

    const url = new URL(request.url)
    // 只處理自己網域的東西；Supabase 等外部請求完全放行
    // （同步結果被快取住會是災難）
    if (url.origin !== self.location.origin) return

    // 導覽請求：network-first，拿不到就用快取的 index.html
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(res => {
                    const copy = res.clone()
                    void caches.open(CACHE).then(c => c.put('./index.html', copy))
                    return res
                })
                .catch(() => caches.match('./index.html').then(r => r ?? Response.error())),
        )
        return
    }

    // 靜態資源：cache-first（檔名帶 hash，內容變了網址就會變）
    event.respondWith(
        caches.match(request).then(cached => cached ?? fetch(request).then(res => {
            // 只快取成功的回應，免得把錯誤頁存起來
            if (res.ok) {
                const copy = res.clone()
                void caches.open(CACHE).then(c => c.put(request, copy))
            }
            return res
        })),
    )
})

// ── 背景補送 ─────────────────────────────────────────────────────────────────

self.addEventListener('sync', event => {
    if (event.tag !== BACKGROUND_SYNC_TAG) return
    event.waitUntil(flushPending())
})

/**
 * ⚠️ 沒送完就要**丟例外**。Background Sync 靠 waitUntil 的 promise 是否 reject
 * 來決定要不要之後再試一次——這裡若安靜地 resolve，瀏覽器會認為任務已完成，
 * 那些速記就要等使用者下次自己打開 App 才會送出去。
 */
async function flushPending(): Promise<void> {
    const result = await flushOutboxCore()
    if (!result.ok && result.remaining > 0) {
        throw new Error(result.error ?? '背景補送失敗，稍後重試')
    }
}
