// @vitest-environment jsdom
// src/components/MoveCardModal.test.tsx
//
// 第一個「元件測試」：和之前測函式/hook 不同，這裡把元件 render 成真正的 DOM，
// 再用「使用者看得到的東西」（文字、按鈕）來查詢與互動。
//   - render(<元件 .../>)：掛上 DOM
//   - screen.getByText / queryByText：像使用者一樣找畫面上的字
//   - fireEvent.click / keyDown：模擬互動
//   - 回呼用 vi.fn() 當間諜，驗證「點了之後有沒有被呼叫、帶什麼參數」
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MoveCardModal } from './MoveCardModal'
import type { BoardRecord } from '../db'

afterEach(cleanup) // 每個 case 後拆掉上一個 render 的 DOM

const board = (over: Partial<BoardRecord> & { id: string; name: string }): BoardRecord =>
    ({ snapshot: null, thumbnail: null, updatedAt: 0, ...over } as BoardRecord)

// 預設一組 props，測試只覆寫關心的部分。
function renderModal(over: Partial<Parameters<typeof MoveCardModal>[0]> = {}) {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<MoveCardModal boards={[]} onSelect={onSelect} onClose={onClose} isDark={false} {...over} />)
    return { onSelect, onClose }
}

describe('MoveCardModal', () => {
    it('列出可移動的白板，排除 home / inbox / 已封存', () => {
        renderModal({
            boards: [
                board({ id: 'home', name: '主頁', isHome: true }),
                board({ id: 'inbox', name: '收件匣', isInbox: true }),
                board({ id: 'arch', name: '封存板', status: 'archived' }),
                board({ id: 'p1', name: '專案A' }),
                board({ id: 'p2', name: '專案B' }),
            ],
        })

        // 只有兩塊一般白板會出現
        expect(screen.getByText('專案A')).toBeTruthy()
        expect(screen.getByText('專案B')).toBeTruthy()
        // 被排除的不出現
        expect(screen.queryByText('主頁')).toBeNull()
        expect(screen.queryByText('收件匣')).toBeNull()
        expect(screen.queryByText('封存板')).toBeNull()
    })

    it('點選白板 → 以該 id 呼叫 onSelect，並關閉視窗', () => {
        const { onSelect, onClose } = renderModal({
            boards: [board({ id: 'p1', name: '專案A' })],
        })

        fireEvent.click(screen.getByText('專案A'))

        expect(onSelect).toHaveBeenCalledWith('p1')
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('沒有可移動白板時顯示空狀態文字', () => {
        renderModal({ boards: [board({ id: 'home', name: '主頁', isHome: true })] })
        expect(screen.getByText('尚無可移動的白板')).toBeTruthy()
    })

    it('按「取消」按鈕會呼叫 onClose', () => {
        const { onClose } = renderModal()
        fireEvent.click(screen.getByText('取消'))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('按 Escape 鍵會呼叫 onClose', () => {
        const { onClose } = renderModal()
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
