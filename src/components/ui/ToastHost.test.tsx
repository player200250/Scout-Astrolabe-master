// @vitest-environment jsdom
// src/components/ui/ToastHost.test.tsx
//
// showToast() 是取代 alert 的非阻塞通知（TD9）。它刻意走 appEvents 匯流排，
// 這樣 utils／hooks 這些非元件的程式碼也能像 alert() 一樣隨處呼叫——
// 這裡就驗這條「發送端 → 匯流排 → 渲染端」的完整鏈路，以及自動消失的計時。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { ToastHost } from './ToastHost'
import { showToast } from '../../utils/toast'

afterEach(cleanup)

describe('ToastHost', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('沒有通知時不渲染任何東西', () => {
        const { container } = render(<ToastHost />)
        expect(container.childElementCount).toBe(0)
    })

    it('showToast 從任何地方呼叫都會顯示（非元件的程式碼也能用）', () => {
        render(<ToastHost />)
        act(() => { showToast('已匯出 PNG') })
        expect(screen.getByText('已匯出 PNG')).toBeTruthy()
    })

    it('多則通知會堆疊', () => {
        render(<ToastHost />)
        act(() => { showToast('第一則'); showToast('第二則') })
        expect(screen.getByText('第一則')).toBeTruthy()
        expect(screen.getByText('第二則')).toBeTruthy()
    })

    it('一般通知 3.5 秒後自動消失', () => {
        render(<ToastHost />)
        act(() => { showToast('存好了', 'success') })
        act(() => { vi.advanceTimersByTime(3400) })
        expect(screen.queryByText('存好了')).toBeTruthy()
        act(() => { vi.advanceTimersByTime(200) })
        expect(screen.queryByText('存好了')).toBeNull()
    })

    it('錯誤通知留久一點（6 秒），因為通常要讀完甚至截圖回報', () => {
        render(<ToastHost />)
        act(() => { showToast('匯入失敗', 'error') })
        act(() => { vi.advanceTimersByTime(3600) })
        expect(screen.queryByText('匯入失敗')).toBeTruthy()
        act(() => { vi.advanceTimersByTime(2500) })
        expect(screen.queryByText('匯入失敗')).toBeNull()
    })

    it('點一下即可提前關閉', () => {
        render(<ToastHost />)
        act(() => { showToast('可以點掉') })
        act(() => { screen.getByText('可以點掉').parentElement!.click() })
        expect(screen.queryByText('可以點掉')).toBeNull()
    })
})
