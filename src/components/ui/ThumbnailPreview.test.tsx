// @vitest-environment jsdom
// src/components/ui/ThumbnailPreview.test.tsx
//
// B4 的驗收標準寫得很具體：hover 250ms 後出現、離開 150ms 後消失、不影響點擊。
// 「幾毫秒後會怎樣」一律用 fake timer 驗——實機碼錶量不得數（視窗被遮蔽時
// Chromium 會節流 setTimeout，量到的是節流後的值）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { useThumbnailPreview, placeNear } from './ThumbnailPreview'

const THUMB = 'data:image/png;base64,AAAA'

function Harness({ thumbnail = THUMB as string | null, name = '手機端測試' } = {}) {
    const { bindPreview, previewNode } = useThumbnailPreview()
    return (
        <>
            <div data-testid="thumb" {...bindPreview(thumbnail, name)}>縮圖</div>
            {previewNode}
        </>
    )
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => { cleanup(); vi.useRealTimers() })

function hover() {
    fireEvent.mouseEnter(screen.getByTestId('thumb'))
}
function unhover() {
    fireEvent.mouseLeave(screen.getByTestId('thumb'))
}
function advance(ms: number) {
    act(() => { vi.advanceTimersByTime(ms) })
}

describe('useThumbnailPreview', () => {
    it('hover 未滿 250ms 不顯示，滿了才顯示', () => {
        render(<Harness />)
        hover()
        advance(249)
        expect(screen.queryByAltText('')).toBeNull()
        advance(1)
        expect(screen.getByAltText('')).toBeTruthy()
        expect(screen.getByText('手機端測試')).toBeTruthy()
    })

    it('只是掃過（250ms 內就離開）不會閃出預覽', () => {
        render(<Harness />)
        hover()
        advance(100)
        unhover()
        advance(1000)
        expect(screen.queryByAltText('')).toBeNull()
    })

    it('離開後 150ms 才消失', () => {
        render(<Harness />)
        hover()
        advance(250)
        unhover()
        advance(149)
        expect(screen.queryByAltText('')).not.toBeNull()
        advance(1)
        expect(screen.queryByAltText('')).toBeNull()
    })

    it('沒有點陣縮圖時完全不綁事件（不會有預覽）', () => {
        render(<Harness thumbnail={null} />)
        hover()
        advance(1000)
        expect(screen.queryByAltText('')).toBeNull()
    })

    it('預覽浮層不吃滑鼠事件（不能擋住切換白板的點擊）', () => {
        render(<Harness />)
        hover()
        advance(250)
        const layer = screen.getByAltText('').parentElement as HTMLElement
        expect(layer.style.pointerEvents).toBe('none')
    })
})

describe('placeNear', () => {
    const rect = (over: Partial<DOMRect>): DOMRect =>
        ({ top: 100, left: 1500, right: 1520, bottom: 114, width: 20, height: 14, x: 1500, y: 100, toJSON: () => ({}), ...over }) as DOMRect

    beforeEach(() => {
        window.innerWidth = 1920
        window.innerHeight = 1032
    })

    it('側邊欄在右側 → 預覽放在縮圖左邊', () => {
        const { left } = placeNear(rect({}))
        expect(left).toBe(1500 - 240 - 12)
    })

    it('左邊放不下時翻到右邊', () => {
        const { left } = placeNear(rect({ left: 40, right: 60 }))
        expect(left).toBe(60 + 12)
    })

    it('垂直方向夾在視窗內，不會被切掉', () => {
        expect(placeNear(rect({ top: 0, bottom: 14 })).top).toBe(8)
        const bottom = placeNear(rect({ top: 1020, bottom: 1032 })).top
        expect(bottom).toBe(1032 - 180 - 8)
    })
})
