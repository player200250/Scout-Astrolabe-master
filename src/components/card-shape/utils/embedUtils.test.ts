// src/components/card-shape/utils/embedUtils.test.ts
//
// getEmbedData 是純函式：吃一個 URL 字串，判斷它是否為可嵌入的影片，
// 回傳 { embedUrl, isEmbeddable, domain }。用 node 環境即可（URL 是內建）。
import { describe, it, expect } from 'vitest'
import { getEmbedData } from './embedUtils'

describe('getEmbedData — YouTube', () => {
    it('watch?v= 連結 → 轉成 /embed/ 並標記為可嵌入', () => {
        const r = getEmbedData('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
        expect(r.isEmbeddable).toBe(true)
        expect(r.domain).toBe('YouTube')
        expect(r.embedUrl).toContain('/embed/dQw4w9WgXcQ')
    })

    it('shorts 連結 → 取 shorts 後的 id', () => {
        const r = getEmbedData('https://www.youtube.com/shorts/abc123XYZ')
        expect(r.isEmbeddable).toBe(true)
        expect(r.embedUrl).toContain('/embed/abc123XYZ')
    })

    it('youtu.be 短網址 → 取路徑作為 id', () => {
        const r = getEmbedData('https://youtu.be/shortID01')
        expect(r.isEmbeddable).toBe(true)
        expect(r.domain).toBe('YouTube')
        expect(r.embedUrl).toContain('/embed/shortID01')
    })

    it('youtube 網域但沒有影片 id → 不可嵌入，domain 維持原網域', () => {
        const r = getEmbedData('https://www.youtube.com/feed/subscriptions')
        expect(r.isEmbeddable).toBe(false)
        expect(r.embedUrl).toBeNull()
        expect(r.domain).toBe('youtube.com')
    })
})

describe('getEmbedData — Bilibili', () => {
    it('BV 號連結 → 帶 bvid 的 player', () => {
        const r = getEmbedData('https://www.bilibili.com/video/BV1xx411c7mD')
        expect(r.isEmbeddable).toBe(true)
        expect(r.domain).toBe('Bilibili')
        expect(r.embedUrl).toContain('bvid=BV1xx411c7mD')
    })

    it('av 號連結 → 帶 aid 的 player', () => {
        const r = getEmbedData('https://www.bilibili.com/video/av170001')
        expect(r.isEmbeddable).toBe(true)
        expect(r.embedUrl).toContain('aid=170001')
    })

    it('bilibili 網域但路徑非影片 → 不可嵌入', () => {
        const r = getEmbedData('https://www.bilibili.com/account/history')
        expect(r.isEmbeddable).toBe(false)
        expect(r.embedUrl).toBeNull()
    })
})

describe('getEmbedData — Vimeo', () => {
    it('數字結尾路徑 → /video/{id}', () => {
        const r = getEmbedData('https://vimeo.com/123456789')
        expect(r.isEmbeddable).toBe(true)
        expect(r.domain).toBe('Vimeo')
        expect(r.embedUrl).toBe('https://player.vimeo.com/video/123456789')
    })

    it('非數字結尾路徑（頻道頁）→ 不可嵌入', () => {
        const r = getEmbedData('https://vimeo.com/channels/staffpicks')
        expect(r.isEmbeddable).toBe(false)
        expect(r.domain).toBe('vimeo.com')
    })
})

describe('getEmbedData — 一般網址與邊界', () => {
    it('一般網站 → 可解析出 domain 但不可嵌入', () => {
        const r = getEmbedData('https://example.com/article/42')
        expect(r.isEmbeddable).toBe(false)
        expect(r.embedUrl).toBeNull()
        expect(r.domain).toBe('example.com')
    })

    it('沒有 scheme 時自動補 https://', () => {
        const r = getEmbedData('example.com/page')
        expect(r.domain).toBe('example.com')
    })

    it('domain 去掉開頭的 www.', () => {
        const r = getEmbedData('https://www.example.org')
        expect(r.domain).toBe('example.org')
    })

    it('前後空白會被 trim 後再解析', () => {
        const r = getEmbedData('  https://youtu.be/trimmed  ')
        expect(r.isEmbeddable).toBe(true)
        expect(r.embedUrl).toContain('/embed/trimmed')
    })

    it('無法解析的 URL → 進 catch，domain 退回原字串、不可嵌入', () => {
        const r = getEmbedData('http://')
        expect(r.isEmbeddable).toBe(false)
        expect(r.embedUrl).toBeNull()
        expect(r.domain).toBe('http://')
    })
})
