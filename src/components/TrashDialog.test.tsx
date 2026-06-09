// @vitest-environment jsdom
// src/components/TrashDialog.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TrashDialog } from './TrashDialog'

afterEach(cleanup)

function renderDialog(over: Partial<Parameters<typeof TrashDialog>[0]> = {}) {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<TrashDialog message="確定刪除？" onConfirm={onConfirm} onCancel={onCancel} isDark={false} {...over} />)
    return { onConfirm, onCancel }
}

describe('TrashDialog', () => {
    it('顯示訊息與預設的副訊息、確認按鈕文字', () => {
        renderDialog()
        expect(screen.getByText('確定刪除？')).toBeTruthy()
        expect(screen.getByText('你可以在垃圾桶中找回（14 天內）')).toBeTruthy()
        expect(screen.getByText('移至垃圾桶')).toBeTruthy()
    })

    it('可自訂 confirmLabel 與 subMessage', () => {
        renderDialog({ confirmLabel: '永久刪除', subMessage: '此操作無法復原' })
        expect(screen.getByText('永久刪除')).toBeTruthy()
        expect(screen.getByText('此操作無法復原')).toBeTruthy()
    })

    it('點確認 / 取消按鈕各自呼叫對應回呼', () => {
        const { onConfirm, onCancel } = renderDialog()
        fireEvent.click(screen.getByText('移至垃圾桶'))
        expect(onConfirm).toHaveBeenCalledTimes(1)
        fireEvent.click(screen.getByText('取消'))
        expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('Enter → 確認、Escape → 取消', () => {
        const { onConfirm, onCancel } = renderDialog()
        fireEvent.keyDown(window, { key: 'Enter' })
        expect(onConfirm).toHaveBeenCalledTimes(1)
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(onCancel).toHaveBeenCalledTimes(1)
    })
})
