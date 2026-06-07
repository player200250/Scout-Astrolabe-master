// src/utils/trashUtils.test.ts
import { describe, it, expect } from 'vitest'
import { getCardPreview } from './trashUtils'

describe('getCardPreview', () => {
    // ── text / journal：剝 HTML、截斷 80 字 ──────────────────────────────
    it('text 卡片剝掉 HTML 標籤', () => {
        expect(getCardPreview({ props: { type: 'text', text: '<p>嗨</p>' } })).toBe('嗨')
    })

    it('journal 卡片同樣剝掉 HTML 標籤', () => {
        expect(getCardPreview({ props: { type: 'journal', text: '<b>今天</b>很好' } })).toBe('今天很好')
    })

    it('text 超過 80 字會截斷成 80 字', () => {
        const long = 'a'.repeat(200)
        expect(getCardPreview({ props: { type: 'text', text: long } })).toHaveLength(80)
    })

    it('text 為空字串回傳佔位文字', () => {
        expect(getCardPreview({ props: { type: 'text', text: '' } })).toBe('（空白文字卡片）')
    })

    it('text 只有空標籤（剝完是空字串）也回傳佔位文字', () => {
        expect(getCardPreview({ props: { type: 'text', text: '<p></p>' } })).toBe('（空白文字卡片）')
    })

    // ── todo ──────────────────────────────────────────────────────────────
    it('todo 有文字時回傳文字', () => {
        expect(getCardPreview({ props: { type: 'todo', text: '買牛奶' } })).toBe('買牛奶')
    })

    it('todo 無文字時回傳預設「待辦清單」', () => {
        expect(getCardPreview({ props: { type: 'todo', text: '' } })).toBe('待辦清單')
    })

    // ── link：title → url → 預設 的 fallback 順序 ───────────────────────────
    it('link 有 title 時優先回傳 title', () => {
        expect(getCardPreview({ props: { type: 'link', title: 'Google', url: 'https://g.com' } })).toBe('Google')
    })

    it('link 無 title 有 url 時回傳 url', () => {
        expect(getCardPreview({ props: { type: 'link', url: 'https://g.com' } })).toBe('https://g.com')
    })

    it('link 兩者皆無時回傳預設「連結卡片」', () => {
        expect(getCardPreview({ props: { type: 'link' } })).toBe('連結卡片')
    })

    // ── 固定字串類型 ────────────────────────────────────────────────────────
    it('image 卡片回傳固定字串', () => {
        expect(getCardPreview({ props: { type: 'image' } })).toBe('圖片卡片')
    })

    it('board 卡片回傳「白板卡: 名稱」', () => {
        expect(getCardPreview({ props: { type: 'board', text: '專案A' } })).toBe('白板卡: 專案A')
    })

    // ── 邊界 / 防呆 ──────────────────────────────────────────────────────────
    it('未知類型回傳預設「卡片」', () => {
        expect(getCardPreview({ props: { type: 'whatever' } })).toBe('卡片')
    })

    it('完全沒有 props 也不會出錯，回傳「卡片」', () => {
        expect(getCardPreview({})).toBe('卡片')
    })
})
