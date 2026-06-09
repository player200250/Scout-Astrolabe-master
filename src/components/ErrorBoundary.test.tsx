// @vitest-environment jsdom
// src/components/ErrorBoundary.test.tsx
//
// ErrorBoundary 是 class 元件 + 錯誤邊界，測法跟一般元件略有不同：
// 要用一個「會丟錯的子元件」去觸發 componentDidCatch，再驗證 fallback 畫面。
// React 捕捉錯誤時會在 console 印出來，這裡用 spy 把它靜音以免污染測試輸出。
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

afterEach(cleanup)

let consoleSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => { consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => consoleSpy.mockRestore())

// 受外部旗標控制要不要丟錯的子元件。
function Boom({ shouldThrow }: { shouldThrow: boolean }) {
    if (shouldThrow) throw new Error('炸了')
    return <div>正常內容</div>
}

describe('ErrorBoundary', () => {
    it('子元件正常時直接渲染 children', () => {
        render(<ErrorBoundary><div>哈囉</div></ErrorBoundary>)
        expect(screen.getByText('哈囉')).toBeTruthy()
    })

    it('子元件丟錯時顯示預設錯誤畫面與錯誤訊息', () => {
        render(<ErrorBoundary><Boom shouldThrow /></ErrorBoundary>)
        expect(screen.getByText('此區塊發生錯誤')).toBeTruthy()
        expect(screen.getByText('炸了')).toBeTruthy()
    })

    it('帶 name 時錯誤標題會帶上名稱', () => {
        render(<ErrorBoundary name="側邊欄"><Boom shouldThrow /></ErrorBoundary>)
        expect(screen.getByText('「側邊欄」發生錯誤')).toBeTruthy()
    })

    it('提供 fallback 時改用自訂畫面', () => {
        render(
            <ErrorBoundary fallback={(err) => <div>自訂：{err.message}</div>}>
                <Boom shouldThrow />
            </ErrorBoundary>,
        )
        expect(screen.getByText('自訂：炸了')).toBeTruthy()
    })

    it('按「重試」reset 後，子元件不再丟錯就恢復正常', () => {
        // rerender 時把 shouldThrow 關掉，再按重試讓邊界重新渲染 children
        const { rerender } = render(<ErrorBoundary><Boom shouldThrow /></ErrorBoundary>)
        expect(screen.getByText('此區塊發生錯誤')).toBeTruthy()

        rerender(<ErrorBoundary><Boom shouldThrow={false} /></ErrorBoundary>)
        fireEvent.click(screen.getByText('重試'))
        expect(screen.getByText('正常內容')).toBeTruthy()
    })
})
