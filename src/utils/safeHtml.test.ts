// @vitest-environment jsdom
// src/utils/safeHtml.test.ts — 卡片 HTML 顯示前的消毒
import { describe, it, expect } from 'vitest'
import { sanitizeCardHtml } from './safeHtml'

describe('sanitizeCardHtml', () => {
    it('拿掉會執行程式的東西', () => {
        const out = sanitizeCardHtml('<p>hi<img src="x" onerror="alert(1)"><script>alert(2)</script></p><a href="javascript:alert(3)">x</a>')
        expect(out).not.toMatch(/onerror|<script|javascript:/i)
        expect(out).toContain('<p>hi')
    })

    it('保留唯讀畫面需要的標記', () => {
        const html = '<details class="toggle-block" open="open"><summary><span class="toggle-caret" data-toggle-caret="" contenteditable="false">▶</span>標題</summary><div class="details-content"><p>內文</p></div></details>'
        expect(sanitizeCardHtml(html)).toBe(html)
    })

    it('保留 wikilink、行內樣式、連結 target', () => {
        const wiki = '<span class="wiki-link" data-wikilink="A%20B" style="color:#3b82f6">[[A B]]</span>'
        expect(sanitizeCardHtml(wiki)).toBe(wiki)
        const link = '<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com">e</a>'
        expect(sanitizeCardHtml(link)).toBe(link)
    })

    it('保留數學式的 data-latex 與 MathML', () => {
        const out = sanitizeCardHtml('<div class="math-block" data-latex="x^2"><span class="katex"><math><semantics><mrow><msup><mi>x</mi><mn>2</mn></msup></mrow></semantics></math></span></div>')
        expect(out).toContain('data-latex="x^2"')
        expect(out).toContain('<msup>')
    })
})
