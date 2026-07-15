// @vitest-environment jsdom
// src/utils/tagColors.test.ts
//
// load/saveTagColors 用 localStorage，需 jsdom 環境。
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
    TAG_PALETTE, loadTagColors, saveTagColors, defaultTagColor, getTagColor, rewriteTagColor,
} from './tagColors'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('defaultTagColor', () => {
    it('同名稱永遠得到同一色（不隨 render 跳色）', () => {
        expect(defaultTagColor('工作')).toBe(defaultTagColor('工作'))
    })

    it('色值一定在色盤內', () => {
        for (const tag of ['a', '工作', 'x'.repeat(50), '']) {
            expect(TAG_PALETTE).toContain(defaultTagColor(tag))
        }
    })
})

describe('getTagColor', () => {
    it('有自訂色時優先用自訂色', () => {
        expect(getTagColor({ 工作: '#123456' }, '工作')).toBe('#123456')
    })

    it('沒自訂色時退回雜湊預設色', () => {
        expect(getTagColor({}, '工作')).toBe(defaultTagColor('工作'))
    })
})

describe('loadTagColors / saveTagColors', () => {
    it('存入後可讀回', () => {
        saveTagColors({ a: '#fff' })
        expect(loadTagColors()).toEqual({ a: '#fff' })
    })

    it('沒有資料時回傳空物件', () => {
        expect(loadTagColors()).toEqual({})
    })

    it('內容毀損（非 JSON / 非物件 / 陣列）時回傳空物件而不拋錯', () => {
        localStorage.setItem('tag-colors', 'not json')
        expect(loadTagColors()).toEqual({})
        localStorage.setItem('tag-colors', '"string"')
        expect(loadTagColors()).toEqual({})
        localStorage.setItem('tag-colors', '[1,2]')
        expect(loadTagColors()).toEqual({})
        localStorage.setItem('tag-colors', 'null')
        expect(loadTagColors()).toEqual({})
    })

    it('localStorage 寫入失敗（容量滿）時不拋錯', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded') })
        expect(() => saveTagColors({ a: '#fff' })).not.toThrow()
    })
})

describe('rewriteTagColor', () => {
    it('來源沒有自訂色時原樣回傳', () => {
        const colors = { b: '#fff' }
        expect(rewriteTagColor(colors, 'a', 'c')).toBe(colors)
    })

    it('改名把顏色接到新名字', () => {
        expect(rewriteTagColor({ a: '#111' }, 'a', 'b')).toEqual({ b: '#111' })
    })

    it('合併到已有自訂色的標籤時保留目標的顏色', () => {
        expect(rewriteTagColor({ a: '#111', b: '#222' }, 'a', 'b')).toEqual({ b: '#222' })
    })

    it('刪除時移除該筆', () => {
        expect(rewriteTagColor({ a: '#111', b: '#222' }, 'a', null)).toEqual({ b: '#222' })
    })

    it('不 mutate 傳入的 map', () => {
        const colors = { a: '#111' }
        rewriteTagColor(colors, 'a', 'b')
        expect(colors).toEqual({ a: '#111' })
    })
})
