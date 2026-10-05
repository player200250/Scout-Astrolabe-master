// @vitest-environment jsdom
// 待辦卡日期欄位的日曆打不開（2026-10-05）：tldraw 的原生 pointerdown 監聽在畫布上，
// 必須在 input 本身用**原生**監聽擋下（React 的 stopPropagation 太晚）。
import { describe, it, expect, vi } from 'vitest'
import { blockCanvasPointerDown } from './nativeInputGuards'

describe('blockCanvasPointerDown', () => {
    it('日期欄位的原生 pointerdown 不會傳到外層（畫布）的原生監聽', () => {
        const canvas = document.createElement('div')
        const input = document.createElement('input')
        input.type = 'date'
        canvas.appendChild(input)
        document.body.appendChild(canvas)
        const canvasListener = vi.fn()
        canvas.addEventListener('pointerdown', canvasListener)

        blockCanvasPointerDown(input)
        input.dispatchEvent(new Event('pointerdown', { bubbles: true }))

        expect(canvasListener).not.toHaveBeenCalled()
    })

    it('其他事件照常往外傳（只擋 pointerdown，不影響點擊、輸入）', () => {
        const canvas = document.createElement('div')
        const input = document.createElement('input')
        canvas.appendChild(input)
        const onClick = vi.fn()
        canvas.addEventListener('click', onClick)

        blockCanvasPointerDown(input)
        input.dispatchEvent(new Event('click', { bubbles: true }))

        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('元素卸載（ref 收到 null）不會出錯', () => {
        expect(() => blockCanvasPointerDown(null)).not.toThrow()
    })
})
