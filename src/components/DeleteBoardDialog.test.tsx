// @vitest-environment jsdom
// src/components/DeleteBoardDialog.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { TLEditorSnapshot } from 'tldraw'
import { DeleteBoardDialog } from './DeleteBoardDialog'
import type { BoardRecord } from '../db'

afterEach(cleanup)

// 把卡片塞進 snapshot.document.store（getCardShapes 從這裡讀）
function snapWithCards(...cards: { id: string; text?: string; type?: string }[]): TLEditorSnapshot {
    const store: Record<string, unknown> = {}
    for (const c of cards) {
        store[c.id] = {
            typeName: 'shape', type: 'card', id: c.id, x: 0, y: 0,
            props: { type: c.type ?? 'text', text: c.text ?? '' },
        }
    }
    return { document: { store } } as unknown as TLEditorSnapshot
}

const board = (over: Partial<BoardRecord> = {}): BoardRecord =>
    ({ id: 'b1', name: '我的白板', snapshot: null, thumbnail: null, updatedAt: 0, ...over } as BoardRecord)

function renderDialog(over: Partial<Parameters<typeof DeleteBoardDialog>[0]> = {}) {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
        <DeleteBoardDialog
            boards={[board()]} hasInbox={false}
            onConfirm={onConfirm} onCancel={onCancel}
            {...over}
        />,
    )
    return { onConfirm, onCancel }
}

describe('DeleteBoardDialog', () => {
    it('標題帶白板名稱；無卡片時顯示「沒有卡片」', () => {
        renderDialog()
        expect(screen.getByText('將「我的白板」移到垃圾桶？')).toBeTruthy()
        expect(screen.getByText('此白板沒有卡片。')).toBeTruthy()
    })

    it('有卡片時顯示卡片數量提示', () => {
        renderDialog({ boards: [board({ snapshot: snapWithCards({ id: 's1' }, { id: 's2' }) })] })
        expect(screen.getByText('白板內有 2 張卡片將一併移入垃圾桶。')).toBeTruthy()
    })

    it('hasInbox=false 時不顯示「移到收件匣」勾選；確認回傳 false', () => {
        const { onConfirm } = renderDialog({ hasInbox: false })
        expect(screen.queryByText(/移到收件匣/)).toBeNull()
        fireEvent.click(screen.getByText('移到垃圾桶'))
        expect(onConfirm).toHaveBeenCalledWith(false)
    })

    it('hasInbox=true 時勾選後確認回傳 true', () => {
        const { onConfirm } = renderDialog({ hasInbox: true })
        fireEvent.click(screen.getByRole('checkbox'))
        fireEvent.click(screen.getByText('移到垃圾桶'))
        expect(onConfirm).toHaveBeenCalledWith(true)
    })

    it('取消按鈕與 Escape 都呼叫 onCancel', () => {
        const { onCancel } = renderDialog()
        fireEvent.click(screen.getByText('取消'))
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(onCancel).toHaveBeenCalledTimes(2)
    })

    it('「查看卡片」可展開／收起（按鈕文字切換）', () => {
        renderDialog({ boards: [board({ snapshot: snapWithCards({ id: 's1', text: '<p>內容A</p>' }) })] })
        const toggle = screen.getByText('▼ 查看卡片')
        fireEvent.click(toggle)
        expect(screen.getByText('▲ 收起')).toBeTruthy()
    })

    describe('批次刪除（多選、清理重複）', () => {
        const two = [
            board({ id: 'b1', name: '主頁白板', snapshot: snapWithCards({ id: 's1' }) }),
            board({ id: 'b2', name: '主頁白板 (2)', snapshot: snapWithCards({ id: 's2' }, { id: 's3' }) }),
        ]

        it('標題講數量、並列出每一塊板的名稱', () => {
            renderDialog({ boards: two })
            expect(screen.getByText('將這 2 塊白板移到垃圾桶？')).toBeTruthy()
            expect(screen.getByText('• 主頁白板')).toBeTruthy()
            expect(screen.getByText('• 主頁白板 (2)')).toBeTruthy()
        })

        it('卡片數是跨板合計', () => {
            renderDialog({ boards: two })
            expect(screen.getByText('合計有 3 張卡片將一併移入垃圾桶。')).toBeTruthy()
        })

        it('全部沒有卡片時講清楚', () => {
            renderDialog({ boards: [board({ id: 'b1', name: 'A' }), board({ id: 'b2', name: 'A (2)' })] })
            expect(screen.getByText('這些白板都沒有卡片。')).toBeTruthy()
        })

        it('跨板撞到同一個 shape id 也能正常渲染（key 帶 boardId）', () => {
            renderDialog({
                boards: [
                    board({ id: 'b1', name: 'A', snapshot: snapWithCards({ id: 'shape:legacy1', text: '甲' }) }),
                    board({ id: 'b2', name: 'A (2)', snapshot: snapWithCards({ id: 'shape:legacy1', text: '乙' }) }),
                ],
            })
            expect(screen.getByText('合計有 2 張卡片將一併移入垃圾桶。')).toBeTruthy()
            fireEvent.click(screen.getByText('▼ 查看卡片'))
            expect(screen.getByText('甲')).toBeTruthy()
            expect(screen.getByText('乙')).toBeTruthy()
        })
    })
})
