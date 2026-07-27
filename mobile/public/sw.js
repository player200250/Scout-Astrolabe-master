// mobile/sw.js — 手機速記 PWA 的 service worker（S1）
//
// 只做一件事：讓 App 離線也打得開。
// 這對這個 App 特別重要——速記的東西存在 localStorage 的 outbox 裡等著補送，
// 但如果離線時連畫面都開不起來，使用者連「再記一筆」都做不到。
//
// 策略刻意分成兩種：
//   · 導覽請求（開啟 App）：network-first，拿不到就用快取的 index.html
//   · 靜態資源（JS/CSS/圖示）：cache-first，因為檔名帶 hash，內容變了網址就會變
//
// ⚠️ Supabase 的 API 請求一律不碰（不快取、不攔截）——同步結果被快取住會是災難。

const CACHE = 'astrolabe-mobile-v1'
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
    if (url.origin !== self.location.origin) return

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(res => {
                    const copy = res.clone()
                    caches.open(CACHE).then(c => c.put('./index.html', copy))
                    return res
                })
                .catch(() => caches.match('./index.html').then(r => r ?? Response.error())),
        )
        return
    }

    event.respondWith(
        caches.match(request).then(cached => cached ?? fetch(request).then(res => {
            // 只快取成功的同源回應；不快取 opaque/錯誤回應，免得把壞東西存起來
            if (res.ok) {
                const copy = res.clone()
                caches.open(CACHE).then(c => c.put(request, copy))
            }
            return res
        })),
    )
})
