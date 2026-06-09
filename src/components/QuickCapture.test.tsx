// @vitest-environment jsdom
// src/components/QuickCapture.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { QuickCapture } from './QuickCapture'

afterEach(cleanup)

function renderQC(over: Partial<Parameters<typeof QuickCapture>[0]> = {}) {
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(<QuickCapture onSave={onSave} onClose={onClose} isDark={false} {...over} />)
    const textarea = screen.getByPlaceholderText('輸入任何想法、任務或筆記...')
    return { onSave, onClose, textarea }
}

describe('QuickCapture', () => {
    it('Enter（無 Shift）且有內容 → 以 trim 後文字呼叫 onSave', () => {
        const { onSave, textarea } = renderQC()
        fireEvent.change(textarea, { target: { value: '  買牛奶  ' } })
        fireEvent.keyDown(textarea, { key: 'Enter' })
        expect(onSave).toHaveBeenCalledWith('買牛奶')
    })

    it('內容只有空白時 Enter 不送出', () => {
        const { onSave, textarea } = renderQC()
        fireEvent.change(textarea, { target: { value: '   ' } })
        fireEvent.keyDown(textarea, { key: 'Enter' })
        expect(onSave).not.toHaveBeenCalled()
    })

    it('Shift+Enter 是換行，不送出', () => {
        const { onSave, textarea } = renderQC()
        fireEvent.change(textarea, { target: { value: '一行' } })
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
        expect(onSave).not.toHaveBeenCalled()
    })

    it('按 Escape（全域）→ onClose', () => {
        const { onClose } = renderQC()
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
