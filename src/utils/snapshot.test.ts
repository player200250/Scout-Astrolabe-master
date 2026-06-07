// src/utils/snapshot.test.ts
import { describe, it, expect } from 'vitest'
import { sanitizeCardProps } from './snapshot'

describe('sanitizeCardProps', () => {
    it('空物件會補滿所有預設欄位', () => {
        const result = sanitizeCardProps({})
        expect(result.text).toBe('')
        expect(result.todos).toEqual([])
        expect(result.w).toBe(240)
        expect(result.h).toBe(120)
        expect(result.color).toBe('none')
        expect(result.cardStatus).toBe('none')
        expect(result.linkedBoardId).toBeNull()
        // 預設表共 15 個欄位
        expect(Object.keys(result)).toHaveLength(15)
    })

    it('值為 undefined 的已知欄位換成對應預設值', () => {
        const result = sanitizeCardProps({ text: undefined, w: undefined })
        expect(result.text).toBe('')
        expect(result.w).toBe(240)
    })

    it('值為 undefined 但不在預設表的欄位補成 null', () => {
        const result = sanitizeCardProps({ text: 'hi', custom: undefined } as never)
        expect((result as Record<string, unknown>).custom).toBeNull()
    })

    it('既有有效值不會被預設值覆蓋', () => {
        const result = sanitizeCardProps({ w: 500, text: '自訂內容' })
        expect(result.w).toBe(500)
        expect(result.text).toBe('自訂內容')
    })

    it('已完整的物件回傳「同一個 reference」（沒有改動）', () => {
        // 先做一個已補滿的完整物件
        const full = sanitizeCardProps({})
        // 再丟回去 sanitize，應原封不動回傳同一個物件
        const again = sanitizeCardProps(full)
        expect(again).toBe(full) // toBe = 同一個 reference
    })

    it('有改動時回傳「新物件」，不汙染原本的 props', () => {
        const original = { text: 'hi' }
        const result = sanitizeCardProps(original)
        expect(result).not.toBe(original)        // 不是同一個 reference
        expect(original).toEqual({ text: 'hi' }) // 原物件未被修改
    })
})
