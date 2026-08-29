// @vitest-environment jsdom
// src/hooks/useTheme.test.ts
//
// 三件事：讀初值、切換時寫回 localStorage、把 data-theme 套到 <html>。
// 另外驗 localStorage 丟例外時不會炸掉——隱私模式下真的會丟。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from './useTheme'

describe('useTheme', () => {
    beforeEach(() => {
        localStorage.clear()
        document.documentElement.removeAttribute('data-theme')
    })
    afterEach(() => vi.restoreAllMocks())

    it('沒設定過時預設淺色', () => {
        const { result } = renderHook(() => useTheme())
        expect(result.current.isDark).toBe(false)
        expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('localStorage 存著 dark 就以深色開場', () => {
        localStorage.setItem('theme', 'dark')
        const { result } = renderHook(() => useTheme())
        expect(result.current.isDark).toBe(true)
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    it('toggleTheme 反轉狀態、寫回 localStorage、並更新 data-theme', () => {
        const { result } = renderHook(() => useTheme())
        act(() => result.current.toggleTheme())
        expect(result.current.isDark).toBe(true)
        expect(localStorage.getItem('theme')).toBe('dark')
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

        act(() => result.current.toggleTheme())
        expect(result.current.isDark).toBe(false)
        expect(localStorage.getItem('theme')).toBe('light')
        expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('localStorage 讀取丟例外時退回淺色，不讓 App 掛掉', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })
        const { result } = renderHook(() => useTheme())
        expect(result.current.isDark).toBe(false)
    })

    it('localStorage 寫入丟例外時，畫面仍然切得動（只是不記住）', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded') })
        const { result } = renderHook(() => useTheme())
        act(() => result.current.toggleTheme())
        expect(result.current.isDark).toBe(true)
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    it('toggleTheme 的 reference 不隨 re-render 改變（依賴它的 useMemo 才不會白重算）', () => {
        const { result, rerender } = renderHook(() => useTheme())
        const first = result.current.toggleTheme
        rerender()
        expect(result.current.toggleTheme).toBe(first)
    })
})
